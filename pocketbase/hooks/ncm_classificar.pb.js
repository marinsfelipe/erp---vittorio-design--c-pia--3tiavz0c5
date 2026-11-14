/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook: Classificação automática de NCM (IA) — processamento em lote.
 *
 * POST /backend/v1/custom/ncm/classificar  (apenas admin, autenticado)
 * Body: {} (opcional)
 *
 * Fluxo:
 * 1. Coleta produtos `boms` com NCM vazio OU status "pendente_fiscal".
 *    - Produtos com ncm_origem = "manual" NUNCA são sobrescritos (pulados).
 * 2. Reexecuta o agente nativo 'classificador-ncm' ($ai.agents) para cada produto
 *    (descrição + categoria + componentes do BOM), uma chamada por produto.
 * 3. Confiança ALTA  -> grava ncm, ncm_origem='automatica', status='pronto_nf'.
 *    Confiança M/B   -> grava ncm_sugerido, ncm_origem='sugestao', ncm_status='pendente_fiscal'.
 *    Sem sugestão    -> marca status='pendente_fiscal' e origem vazia.
 * 4. Progresso: coleção `ncm_lote_progresso` (id fixo 'ativo') é atualizada a cada
 *    produto; o front consulta via REST a cada 1,5 s para exibir progresso.
 * 5. Resumo final gravado no mesmo registro de progresso.
 *
 * Processamento em segundo plano: a rota responde imediatamente (202) e o lote
 * continua via timer (setTimeout do jsvm). Se não houver timer disponível, o lote
 * roda em modo síncrono ("inline") dentro da própria requisição.
 *
 * IMPORTANTE: a origem 'manual' nunca é sobrescrita. A importação via planilha e a
 * automação coexistem — o que for executado por último prevalece.
 */

routerAdd(
  'POST',
  '/backend/v1/custom/ncm/classificar',
  (e) => {
    const info = e.requestInfo()
    const auth = info.auth

    if (!auth) {
      throw new ApiError(401, 'Autenticação necessária.')
    }
    const perfil = auth.get('perfil') || ''
    if (perfil !== 'admin') {
      throw new ApiError(403, 'Apenas administradores podem executar a classificação de NCMs.')
    }

    // Se já existe um lote em andamento, rejeita novo disparo.
    try {
      const prog = app.findRecordById('ncm_lote_progresso', 'ativo')
      if (prog.getString('estado') === 'executando') {
        throw new ApiError(409, 'Já existe uma classificação em andamento. Aguarde o término.')
      }
    } catch (err) {
      if (err instanceof ApiError) {
        throw err
      }
      // registro ainda não existe: segue
    }

    // 1. Coleta produtos pendentes: NCM vazio OU status pendente fiscal.
    //    Origem 'manual' é sempre preservada (nunca sobrescrita pela automação).
    let alvos = []
    try {
      alvos = app
        .findRecordsByFilter(
          'boms',
          "(ncm = '' || ncm IS NULL || ncm_status = 'pendente_fiscal') && ncm_origem != 'manual'",
          'created',
          500,
          0,
        )
        .toArray()
    } catch (_) {
      alvos = []
    }

    const total = alvos.length

    // Cria/renova registro de progresso
    let prog = null
    try {
      prog = app.findRecordById('ncm_lote_progresso', 'ativo')
    } catch (_) {
      const col = app.findCollectionByNameOrId('ncm_lote_progresso')
      prog = new Record(col)
      prog.set('id', 'ativo')
    }
    prog.set('estado', 'executando')
    prog.set('total', total)
    prog.set('processados', 0)
    prog.set('auto_alta', 0)
    prog.set('sugestoes', 0)
    prog.set('sem_sugestao', 0)
    prog.set('erros', 0)
    prog.set('mensagem', total > 0 ? 'Processando...' : 'Nenhum produto pendente de NCM.')
    prog.set('iniciado_em', new Date().toISOString())
    prog.set('finalizado_em', null)
    app.save(prog)

    if (total === 0) {
      prog.set('estado', 'concluido')
      prog.set('finalizado_em', new Date().toISOString())
      app.save(prog)
      return e.json(200, {
        ok: true,
        total: 0,
        estado: 'concluido',
        mensagem: 'Nenhum produto pendente de classificação de NCM.',
      })
    }

    // ---------------------- Coleta de componentes por BOM ----------------------
    function componentesDeBom(bomId) {
      try {
        const itens = app
          .findRecordsByFilter('bom_items', "bom_id = '" + bomId + "'", 'ordem', 100, 0)
          .toArray()
        return itens
          .map((it) => {
            const cod = it.getString('codigo') || ''
            const desc = it.getString('descricao') || ''
            if (!cod && !desc) return null
            let linha = desc || cod
            if (cod && desc && desc.indexOf(cod) !== 0) linha = cod + ' - ' + desc
            return linha
          })
          .filter(Boolean)
          .slice(0, 15)
      } catch (_) {
        return []
      }
    }

    // ---------------------- Chamada do agente (1 produto) ----------------------
    function classificarProduto(rec) {
      const sku = rec.getString('sku') || ''
      const nome = rec.getString('nome') || ''
      const descricao = rec.getString('descricao') || ''
      const categoria = rec.getString('categoria') || ''
      const comps = componentesDeBom(rec.id)

      const payload = JSON.stringify({
        sku: sku,
        nome: nome,
        descricao: descricao,
        categoria: categoria,
        componentes: comps,
      })

      const resposta = $ai.agents.run('classificador-ncm', payload)
      let texto = ''
      if (resposta === null || resposta === undefined) {
        return { erro: 'Agente não respondeu' }
      }
      if (typeof resposta === 'string') {
        texto = resposta
      } else {
        texto = resposta.answer || resposta.response || resposta.text || resposta.output || ''
        if (!texto && typeof resposta === 'object') {
          try {
            texto = JSON.stringify(resposta)
          } catch (_) {
            texto = ''
          }
        }
      }
      if (!texto || !texto.trim()) {
        return { erro: 'Resposta vazia do agente' }
      }

      // Tenta extrair JSON (tolerante a crases/markdown)
      let json = null
      const m = texto.match(/\{[\s\S]*\}/)
      if (m) {
        try {
          json = JSON.parse(m[0])
        } catch (_) {
          json = null
        }
      }
      if (!json) {
        return { erro: 'Resposta da IA não contém JSON válido' }
      }

      // Normaliza NCM: apenas dígitos, sempre 8
      let ncm = String(json.ncm || '').replace(/\D/g, '')
      const conf = String(json.confianca || '').toLowerCase()
      const just = String(json.justificativa || '')
        .trim()
        .slice(0, 480)

      if (!ncm || ncm.length !== 8) {
        return { erro: 'NCM inválido ou ausente na resposta da IA', justificativa: just }
      }
      if (conf !== 'alta' && conf !== 'media' && conf !== 'baixa') {
        return { erro: 'Confiança inválida na resposta da IA', justificativa: just }
      }

      return { ncm: ncm, confianca: conf, justificativa: just }
    }

    // ---------------------- Aplicação da sugestão ----------------------
    function aplicarSugestao(rec, res) {
      if (res.erro) {
        rec.set('ncm', '')
        rec.set('ncm_sugerido', '')
        rec.set('ncm_origem', '')
        rec.set('ncm_confianca', '')
        rec.set('ncm_status', 'pendente_fiscal')
        rec.set('ncm_justificativa', '')
        rec.set('ncm_classificado_em', new Date().toISOString())
        app.save(rec)
        return { tipo: 'sem_sugestao' }
      }

      if (res.confianca === 'alta') {
        rec.set('ncm', res.ncm)
        rec.set('ncm_sugerido', '')
        rec.set('ncm_origem', 'automatica')
        rec.set('ncm_confianca', 'alta')
        rec.set('ncm_status', 'pronto_nf')
        rec.set('ncm_justificativa', res.justificativa || '')
        rec.set('ncm_classificado_em', new Date().toISOString())
        app.save(rec)
        return { tipo: 'auto_alta' }
      }

      // MÉDIA ou BAIXA: apenas sugestão pendente de confirmação
      rec.set('ncm', '')
      rec.set('ncm_sugerido', res.ncm)
      rec.set('ncm_origem', 'sugestao')
      rec.set('ncm_confianca', res.confianca)
      rec.set('ncm_status', 'pendente_fiscal')
      rec.set('ncm_justificativa', res.justificativa || '')
      rec.set('ncm_classificado_em', new Date().toISOString())
      app.save(rec)
      return { tipo: 'sugestoes' }
    }

    // ---------------------- Loop do lote ----------------------
    let processados = 0
    let autoAlta = 0
    let sugestoes = 0
    let semSugestao = 0
    let erros = 0

    function processarLote() {
      for (const rec of alvos) {
        // Releitura (guarda: registro pode ter sido alterado/removido durante o lote)
        let atual = null
        try {
          atual = app.findRecordById('boms', rec.id)
        } catch (_) {
          processados++
          continue
        }

        // Guarda extra: origem manual nunca é sobrescrita
        const origemAtual = atual.getString('ncm_origem') || ''
        if (origemAtual === 'manual') {
          processados++
          continue
        }

        let resultado = null
        try {
          resultado = classificarProduto(atual)
        } catch (errAg) {
          resultado = {
            erro:
              'Falha ao consultar agente: ' +
              (errAg && errAg.message ? errAg.message : String(errAg)),
          }
        }

        let tipo = 'sem_sugestao'
        try {
          tipo = aplicarSugestao(atual, resultado).tipo
        } catch (errAp) {
          tipo = 'sem_sugestao'
          erros++
        }

        processados++
        if (tipo === 'auto_alta') autoAlta++
        else if (tipo === 'sugestoes') sugestoes++
        else if (tipo === 'sem_sugestao') semSugestao++

        // Atualiza progresso a cada produto
        try {
          prog.set('processados', processados)
          prog.set('auto_alta', autoAlta)
          prog.set('sugestoes', sugestoes)
          prog.set('sem_sugestao', semSugestao)
          prog.set('erros', erros)
          prog.set('mensagem', 'Processando... ' + processados + '/' + total + ' produto(s)')
          app.save(prog)
        } catch (_) {}
      }

      prog.set('estado', 'concluido')
      prog.set('mensagem', 'Classificação concluída.')
      prog.set('finalizado_em', new Date().toISOString())
      app.save(prog)
      console.log(
        '[NCM] Lote concluído: ' +
          processados +
          ' processado(s), ' +
          autoAlta +
          ' alta confiança, ' +
          sugestoes +
          ' sugestão(ões), ' +
          semSugestao +
          ' sem sugestão.',
      )
    }

    // ---------------------- Execução em segundo plano ----------------------
    try {
      // jsvm expõe setTimeout: agenda o lote e responde imediatamente (202).
      setTimeout(function () {
        try {
          processarLote()
        } catch (errBg) {
          console.log('[NCM] Erro no lote em segundo plano: ' + String(errBg))
          try {
            prog.set('estado', 'erro')
            prog.set('mensagem', 'Falha no processamento do lote.')
            prog.set('finalizado_em', new Date().toISOString())
            app.save(prog)
          } catch (_) {}
        }
      }, 10)
      return e.json(202, {
        ok: true,
        total: total,
        estado: 'executando',
        mensagem: 'Classificação iniciada para ' + total + ' produto(s).',
      })
    } catch (_) {
      // Timer não disponível: roda em modo síncrono (inline) na própria requisição.
      processarLote()
      return e.json(200, {
        ok: true,
        total: total,
        estado: 'concluido',
        resumo: {
          total: total,
          processados: processados,
          classificados_automaticamente: autoAlta,
          sugestoes_aguardando_confirmacao: sugestoes,
          sem_sugestao_confiavel: semSugestao,
        },
      })
    }
  },
  // Regra: apenas autenticados com perfil admin (dupla checagem no handler).
  $apis.requireAuth(),
)

// GET /backend/v1/custom/ncm/progresso — progresso do lote (qualquer autenticado)
routerAdd(
  'GET',
  '/backend/v1/custom/ncm/progresso',
  (e) => {
    const info = e.requestInfo()
    if (!info.auth) {
      throw new ApiError(401, 'Autenticação necessária.')
    }
    try {
      const prog = app.findRecordById('ncm_lote_progresso', 'ativo')
      return e.json(200, {
        ok: true,
        estado: prog.getString('estado') || '',
        total: prog.getInt('total'),
        processados: prog.getInt('processados'),
        auto_alta: prog.getInt('auto_alta'),
        sugestoes: prog.getInt('sugestoes'),
        sem_sugestao: prog.getInt('sem_sugestao'),
        erros: prog.getInt('erros'),
        mensagem: prog.getString('mensagem') || '',
        finalizado_em: prog.getString('finalizado_em') || '',
      })
    } catch (_) {
      return e.json(200, { ok: true, estado: 'indefinido', total: 0, processados: 0 })
    }
  },
  $apis.requireAuth(),
)
