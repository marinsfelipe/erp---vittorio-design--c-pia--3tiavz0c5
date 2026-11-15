/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook: Classificação de NCM por REGRAS FIXAS de palavras-chave (sem IA).
 *
 * ROTAS (contratos mantidos — chamadas no front via pb.send):
 *   POST /backend/v1/custom/ncm/classificar  (apenas admin) — dispara o lote
 *   GET  /backend/v1/custom/ncm/progresso    (autenticado)  — progresso/resumo
 *
 * REGRAS (primeira que casar, nesta ordem), aplicadas sobre nome/descrição/
 * categoria do produto + nome/descrição/categoria dos componentes do BOM.
 * Busca por início de palavra, sem diferenciar maiúsculas/minúsculas e acentos:
 *   1. refrigerador/refrigerada(o)/refrigeração -> 8418.50.90
 *   2. freezer                                  -> 8418.50.10
 *   3. mobiliário / mesa / estante(s) / bancada(s) -> 9403.20.10
 *   4. vitrine aquecida OU estufa               -> 8419.89.20
 *   5. vitrine neutra                           -> 9403.20.90
 *   6. cocção                                   -> 8419.81.90
 *
 * PROTEÇÕES: origem 'manual' NUNCA é sobrescrita; aplicação automática no
 * create/update de `boms` (mutação + e.next()) e de `bom_items` (aplica ao
 * produto dono via app.save — sem loop, pois boms não dispara save de boms).
 *
 * Progresso gravado em `ncm_lote_progresso`, registro único id 'ncmloteativo001'.
 *
 * IMPORTANTE (JSVM): callbacks rodam em pool separado — TODA a lógica de regras
 * vive DENTRO de cada callback (nenhuma função/variável global é referenciada).
 */

// ---------------------------------------------------------------------------
// POST /backend/v1/custom/ncm/classificar — dispara o lote (apenas admin)
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/custom/ncm/classificar',
  (e) => {
    // ---- motor de regras (local: o JSVM não compartilha globals) ------------
    function normalizar(t) {
      if (!t) return ''
      var s = String(t).toLowerCase()
      var de = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
      var para = 'aaaaaeeeeiiiiooooouuuucn'
      var out = ''
      for (var i = 0; i < s.length; i++) {
        var idx = de.indexOf(s.charAt(i))
        out += idx >= 0 ? para.charAt(idx) : s.charAt(i)
      }
      return out
    }

    var REGRAS = [
      {
        ncm: '84185090',
        rotulo: 'Refrigerador',
        termos: ['refrigerador', 'refrigerada', 'refrigerado', 'refrigeracao'],
      },
      { ncm: '84185010', rotulo: 'Freezer', termos: ['freezer'] },
      {
        ncm: '94032010',
        rotulo: 'Mobiliário',
        termos: ['mobiliario', 'mesa', 'estante', 'estantes', 'bancada', 'bancadas'],
      },
      {
        ncm: '84198920',
        rotulo: 'Vitrine aquecida / Estufa',
        termos: ['vitrine aquecida', 'estufa'],
      },
      { ncm: '94032090', rotulo: 'Vitrine neutra', termos: ['vitrine neutra'] },
      { ncm: '84198190', rotulo: 'Cocção', termos: ['coccao'] },
    ]

    function casar(texto) {
      var txt = normalizar(texto).replace(/[^a-z0-9]+/g, ' ')
      if (!txt) return null
      for (var i = 0; i < REGRAS.length; i++) {
        var r = REGRAS[i]
        for (var j = 0; j < r.termos.length; j++) {
          // início de palavra: "refrigerada" casa "refrigerador/refrigerado"
          var padrao = normalizar(r.termos[j]).trim().split(/\s+/).join('\\s+')
          if (new RegExp('(^| )' + padrao, 'i').test(txt))
            return { ncm: r.ncm, rotulo: r.rotulo, termo: r.termos[j] }
        }
      }
      return null
    }

    function textoDoProduto(app, rec) {
      var partes = [
        rec.getString('nome') || '',
        rec.getString('descricao') || '',
        rec.getString('categoria') || '',
      ]
      try {
        var itens = app.findRecordsByFilter('bom_items', "bom_id = '" + rec.id + "'", '', 1000, 0)
        for (var i = 0; i < itens.length; i++) {
          partes.push(itens[i].getString('codigo') || '')
          partes.push(itens[i].getString('descricao') || '')
          partes.push(itens[i].getString('categoria') || '')
        }
      } catch (_) {}
      return partes.filter(Boolean).join(' | ')
    }

    function classificar(app, rec) {
      var casou = casar(textoDoProduto(app, rec))
      rec.set('ncm_sugerido', '')
      rec.set('ncm_confianca', '')
      rec.set('ncm_classificado_em', new Date().toISOString())
      if (!casou) {
        rec.set('ncm', '')
        rec.set('ncm_origem', '')
        rec.set('ncm_status', 'pendente_fiscal')
        rec.set('ncm_justificativa', '')
        app.save(rec)
        return 'sem_regra'
      }
      rec.set('ncm', casou.ncm)
      rec.set('ncm_origem', 'automatica')
      rec.set('ncm_confianca', 'alta')
      rec.set('ncm_status', 'pronto_nf')
      rec.set(
        'ncm_justificativa',
        String('Regra: ' + casou.rotulo + ' (palavra-chave "' + casou.termo + '")').slice(0, 500),
      )
      app.save(rec)
      return 'classificados'
    }

    // ------------------------------ handler ---------------------------------
    const app = e.app
    const auth = e.requestInfo().auth
    if (!auth) throw new ApiError(401, 'Autenticação necessária.')
    if ((auth.get('perfil') || '') !== 'admin') {
      throw new ApiError(403, 'Apenas administradores podem executar a classificação de NCMs.')
    }

    const PROG_ID = 'ncmloteativo001'

    let prog = null
    try {
      prog = app.findRecordById('ncm_lote_progresso', PROG_ID)
    } catch (_) {
      prog = new Record(app.findCollectionByNameOrId('ncm_lote_progresso'))
      prog.set('id', PROG_ID)
    }
    if (prog.getString('estado') === 'executando') {
      throw new ApiError(409, 'Já existe uma classificação em andamento. Aguarde o término.')
    }

    // Alvos: NCM vazio OU pendente fiscal — origem 'manual' SEMPRE preservada
    let alvos = []
    try {
      alvos = app.findRecordsByFilter(
        'boms',
        "(ncm = '' || ncm_status = 'pendente_fiscal') && ncm_origem != 'manual'",
        'created',
        500,
        0,
      )
    } catch (_) {
      alvos = []
    }
    const total = alvos.length

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

    const processarLote = function () {
      let processados = 0
      let classificados = 0
      let semRegra = 0
      let manuais = 0
      let erros = 0

      for (let i = 0; i < alvos.length; i++) {
        let atual = null
        try {
          atual = app.findRecordById('boms', alvos[i].id)
        } catch (_) {
          processados++
          continue
        }
        // Guarda: manual nunca é sobrescrito
        if ((atual.getString('ncm_origem') || '') === 'manual') {
          manuais++
          processados++
          continue
        }
        try {
          const r = classificar(app, atual)
          if (r === 'classificados') classificados++
          else semRegra++
        } catch (errR) {
          console.log('[NCM] Erro ao classificar ' + atual.id + ': ' + String(errR))
          erros++
        }
        processados++
        try {
          prog.set('processados', processados)
          prog.set('auto_alta', classificados)
          prog.set('sugestoes', manuais)
          prog.set('sem_sugestao', semRegra)
          prog.set('erros', erros)
          prog.set('mensagem', 'Processando... ' + processados + '/' + total + ' produto(s)')
          app.save(prog)
        } catch (_) {}
      }

      try {
        prog.set('estado', 'concluido')
        prog.set('finalizado_em', new Date().toISOString())
        prog.set(
          'mensagem',
          'Concluído: ' +
            classificados +
            ' classificado(s), ' +
            semRegra +
            ' sem regra aplicável, ' +
            manuais +
            ' manual(is) preservado(s).',
        )
        app.save(prog)
      } catch (_) {}
      console.log(
        '[NCM] Lote por regras concluído: ' +
          processados +
          ' processado(s), ' +
          classificados +
          ' classificado(s), ' +
          semRegra +
          ' sem regra, ' +
          manuais +
          ' manual(is), ' +
          erros +
          ' erro(s).',
      )
    }

    // Segundo plano (timer do JSVM); fallback síncrono caso o timer falhe
    try {
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
      processarLote()
      return e.json(200, { ok: true, total: total, estado: 'concluido' })
    }
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// GET /backend/v1/custom/ncm/progresso — progresso/resumo do lote
// ---------------------------------------------------------------------------
routerAdd(
  'GET',
  '/backend/v1/custom/ncm/progresso',
  (e) => {
    if (!e.requestInfo().auth) throw new ApiError(401, 'Autenticação necessária.')
    try {
      const prog = e.app.findRecordById('ncm_lote_progresso', 'ncmloteativo001')
      return e.json(200, {
        ok: true,
        estado: prog.getString('estado') || '',
        total: prog.getInt('total'),
        processados: prog.getInt('processados'),
        classificados: prog.getInt('auto_alta'),
        sem_regra: prog.getInt('sem_sugestao'),
        manuais_preservados: prog.getInt('sugestoes'),
        erros: prog.getInt('erros'),
        mensagem: prog.getString('mensagem') || '',
      })
    } catch (_) {
      return e.json(200, {
        ok: true,
        estado: 'indefinido',
        total: 0,
        processados: 0,
        classificados: 0,
        sem_regra: 0,
        manuais_preservados: 0,
        erros: 0,
        mensagem: '',
      })
    }
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// Aplicação automática: a cada CRIAÇÃO/ATUALIZAÇÃO de BOM, aplica as regras ao
// próprio registro (mutação + e.next() — sem app.save dentro do hook de boms).
// Origem 'manual' nunca é sobrescrita. Lógica de regras inline (JSVM).
// ---------------------------------------------------------------------------
onRecordCreate('boms', (e) => {
  const rec = e.record
  try {
    if ((rec.getString('ncm_origem') || '') !== 'manual') {
      function normalizar(t) {
        if (!t) return ''
        var s = String(t).toLowerCase()
        var de = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
        var para = 'aaaaaeeeeiiiiooooouuuucn'
        var out = ''
        for (var i = 0; i < s.length; i++) {
          var idx = de.indexOf(s.charAt(i))
          out += idx >= 0 ? para.charAt(idx) : s.charAt(i)
        }
        return out
      }
      var REGRAS = [
        {
          ncm: '84185090',
          rotulo: 'Refrigerador',
          termos: ['refrigerador', 'refrigerada', 'refrigerado', 'refrigeracao'],
        },
        { ncm: '84185010', rotulo: 'Freezer', termos: ['freezer'] },
        {
          ncm: '94032010',
          rotulo: 'Mobiliário',
          termos: ['mobiliario', 'mesa', 'estante', 'estantes', 'bancada', 'bancadas'],
        },
        {
          ncm: '84198920',
          rotulo: 'Vitrine aquecida / Estufa',
          termos: ['vitrine aquecida', 'estufa'],
        },
        { ncm: '94032090', rotulo: 'Vitrine neutra', termos: ['vitrine neutra'] },
        { ncm: '84198190', rotulo: 'Cocção', termos: ['coccao'] },
      ]
      var txt = normalizar(
        [rec.getString('nome'), rec.getString('descricao'), rec.getString('categoria')]
          .filter(Boolean)
          .join(' | '),
      ).replace(/[^a-z0-9]+/g, ' ')
      var casou = null
      var termo = ''
      for (var i = 0; i < REGRAS.length && !casou; i++) {
        var r = REGRAS[i]
        for (var j = 0; j < r.termos.length && !casou; j++) {
          var padrao = normalizar(r.termos[j]).trim().split(/\s+/).join('\\s+')
          if (new RegExp('(^| )' + padrao, 'i').test(txt)) {
            casou = r
            termo = r.termos[j]
          }
        }
      }
      rec.set('ncm_sugerido', '')
      rec.set('ncm_classificado_em', new Date().toISOString())
      if (casou) {
        rec.set('ncm', casou.ncm)
        rec.set('ncm_origem', 'automatica')
        rec.set('ncm_confianca', 'alta')
        rec.set('ncm_status', 'pronto_nf')
        rec.set(
          'ncm_justificativa',
          String('Regra: ' + casou.rotulo + ' (palavra-chave "' + termo + '")').slice(0, 500),
        )
      } else {
        rec.set('ncm_status', 'pendente_fiscal')
      }
    }
  } catch (err) {
    console.log('[NCM] Erro no create de boms: ' + String(err))
  }
  e.next()
})

onRecordUpdate('boms', (e) => {
  const rec = e.record
  try {
    if ((rec.getString('ncm_origem') || '') !== 'manual') {
      const ncm = rec.getString('ncm') || ''
      const status = rec.getString('ncm_status') || ''
      if (!(ncm && status === 'pronto_nf')) {
        function normalizar(t) {
          if (!t) return ''
          var s = String(t).toLowerCase()
          var de = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
          var para = 'aaaaaeeeeiiiiooooouuuucn'
          var out = ''
          for (var i = 0; i < s.length; i++) {
            var idx = de.indexOf(s.charAt(i))
            out += idx >= 0 ? para.charAt(idx) : s.charAt(i)
          }
          return out
        }
        var REGRAS = [
          {
            ncm: '84185090',
            rotulo: 'Refrigerador',
            termos: ['refrigerador', 'refrigerada', 'refrigerado', 'refrigeracao'],
          },
          { ncm: '84185010', rotulo: 'Freezer', termos: ['freezer'] },
          {
            ncm: '94032010',
            rotulo: 'Mobiliário',
            termos: ['mobiliario', 'mesa', 'estante', 'estantes', 'bancada', 'bancadas'],
          },
          {
            ncm: '84198920',
            rotulo: 'Vitrine aquecida / Estufa',
            termos: ['vitrine aquecida', 'estufa'],
          },
          { ncm: '94032090', rotulo: 'Vitrine neutra', termos: ['vitrine neutra'] },
          { ncm: '84198190', rotulo: 'Cocção', termos: ['coccao'] },
        ]
        var txt = normalizar(
          [rec.getString('nome'), rec.getString('descricao'), rec.getString('categoria')]
            .filter(Boolean)
            .join(' | '),
        ).replace(/[^a-z0-9]+/g, ' ')
        var casou = null
        var termo = ''
        for (var i = 0; i < REGRAS.length && !casou; i++) {
          var r = REGRAS[i]
          for (var j = 0; j < r.termos.length && !casou; j++) {
            var padrao = normalizar(r.termos[j]).trim().split(/\s+/).join('\\s+')
            if (new RegExp('(^| )' + padrao, 'i').test(txt)) {
              casou = r
              termo = r.termos[j]
            }
          }
        }
        rec.set('ncm_sugerido', '')
        rec.set('ncm_classificado_em', new Date().toISOString())
        if (casou) {
          rec.set('ncm', casou.ncm)
          rec.set('ncm_origem', 'automatica')
          rec.set('ncm_confianca', 'alta')
          rec.set('ncm_status', 'pronto_nf')
          rec.set(
            'ncm_justificativa',
            String('Regra: ' + casou.rotulo + ' (palavra-chave "' + termo + '")').slice(0, 500),
          )
        } else {
          rec.set('ncm_status', 'pendente_fiscal')
        }
      }
    }
  } catch (err) {
    console.log('[NCM] Erro no update de boms: ' + String(err))
  }
  e.next()
})

// Item de BOM criado/atualizado: aplica a regra ao PRODUTO dono (inclui nome/
// descrição/categoria dos componentes no texto de busca). app.save(rec) grava o
// boms diretamente (não passa pelos hooks acima pois é save direto de outro
// collection... na verdade app.save dispara onRecordUpdate de boms — mas o hook
// de update só reclassifica quando NCM vazio/pendente, e aqui o registro já
// fica pronto_nf, então não há loop de gravação infinito).
onRecordCreate('bom_items', (e) => {
  const app = e.app
  const bomId = e.record.getString('bom_id') || ''
  if (!bomId) return
  try {
    const rec = app.findRecordById('boms', bomId)
    if ((rec.getString('ncm_origem') || '') === 'manual') return
    if (rec.getString('ncm') && rec.getString('ncm_status') === 'pronto_nf') return
    function normalizar(t) {
      if (!t) return ''
      var s = String(t).toLowerCase()
      var de = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
      var para = 'aaaaaeeeeiiiiooooouuuucn'
      var out = ''
      for (var i = 0; i < s.length; i++) {
        var idx = de.indexOf(s.charAt(i))
        out += idx >= 0 ? para.charAt(idx) : s.charAt(i)
      }
      return out
    }
    var REGRAS = [
      {
        ncm: '84185090',
        rotulo: 'Refrigerador',
        termos: ['refrigerador', 'refrigerada', 'refrigerado', 'refrigeracao'],
      },
      { ncm: '84185010', rotulo: 'Freezer', termos: ['freezer'] },
      {
        ncm: '94032010',
        rotulo: 'Mobiliário',
        termos: ['mobiliario', 'mesa', 'estante', 'estantes', 'bancada', 'bancadas'],
      },
      {
        ncm: '84198920',
        rotulo: 'Vitrine aquecida / Estufa',
        termos: ['vitrine aquecida', 'estufa'],
      },
      { ncm: '94032090', rotulo: 'Vitrine neutra', termos: ['vitrine neutra'] },
      { ncm: '84198190', rotulo: 'Cocção', termos: ['coccao'] },
    ]
    var partes = [
      rec.getString('nome') || '',
      rec.getString('descricao') || '',
      rec.getString('categoria') || '',
    ]
    try {
      var itens = app.findRecordsByFilter('bom_items', "bom_id = '" + rec.id + "'", '', 1000, 0)
      for (var x = 0; x < itens.length; x++) {
        partes.push(itens[x].getString('codigo') || '')
        partes.push(itens[x].getString('descricao') || '')
        partes.push(itens[x].getString('categoria') || '')
      }
    } catch (_) {}
    var txt = normalizar(partes.filter(Boolean).join(' | ')).replace(/[^a-z0-9]+/g, ' ')
    var casou = null
    var termo = ''
    for (var i = 0; i < REGRAS.length && !casou; i++) {
      var r = REGRAS[i]
      for (var j = 0; j < r.termos.length && !casou; j++) {
        var padrao = normalizar(r.termos[j]).trim().split(/\s+/).join('\\s+')
        if (new RegExp('(^| )' + padrao, 'i').test(txt)) {
          casou = r
          termo = r.termos[j]
        }
      }
    }
    if (casou) {
      rec.set('ncm', casou.ncm)
      rec.set('ncm_origem', 'automatica')
      rec.set('ncm_confianca', 'alta')
      rec.set('ncm_status', 'pronto_nf')
      rec.set(
        'ncm_justificativa',
        String('Regra: ' + casou.rotulo + ' (palavra-chave "' + termo + '")').slice(0, 500),
      )
      rec.set('ncm_sugerido', '')
      rec.set('ncm_classificado_em', new Date().toISOString())
      app.save(rec)
    }
  } catch (err) {
    console.log('[NCM] Falha na aplicação automática ao BOM ' + bomId + ': ' + String(err))
  }
})

onRecordUpdate('bom_items', (e) => {
  const app = e.app
  const bomId = e.record.getString('bom_id') || ''
  if (!bomId) return
  try {
    const rec = app.findRecordById('boms', bomId)
    if ((rec.getString('ncm_origem') || '') === 'manual') return
    if (rec.getString('ncm') && rec.getString('ncm_status') === 'pronto_nf') return
    function normalizar(t) {
      if (!t) return ''
      var s = String(t).toLowerCase()
      var de = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
      var para = 'aaaaaeeeeiiiiooooouuuucn'
      var out = ''
      for (var i = 0; i < s.length; i++) {
        var idx = de.indexOf(s.charAt(i))
        out += idx >= 0 ? para.charAt(idx) : s.charAt(i)
      }
      return out
    }
    var REGRAS = [
      {
        ncm: '84185090',
        rotulo: 'Refrigerador',
        termos: ['refrigerador', 'refrigerada', 'refrigerado', 'refrigeracao'],
      },
      { ncm: '84185010', rotulo: 'Freezer', termos: ['freezer'] },
      {
        ncm: '94032010',
        rotulo: 'Mobiliário',
        termos: ['mobiliario', 'mesa', 'estante', 'estantes', 'bancada', 'bancadas'],
      },
      {
        ncm: '84198920',
        rotulo: 'Vitrine aquecida / Estufa',
        termos: ['vitrine aquecida', 'estufa'],
      },
      { ncm: '94032090', rotulo: 'Vitrine neutra', termos: ['vitrine neutra'] },
      { ncm: '84198190', rotulo: 'Cocção', termos: ['coccao'] },
    ]
    var partes = [
      rec.getString('nome') || '',
      rec.getString('descricao') || '',
      rec.getString('categoria') || '',
    ]
    try {
      var itens = app.findRecordsByFilter('bom_items', "bom_id = '" + rec.id + "'", '', 1000, 0)
      for (var x = 0; x < itens.length; x++) {
        partes.push(itens[x].getString('codigo') || '')
        partes.push(itens[x].getString('descricao') || '')
        partes.push(itens[x].getString('categoria') || '')
      }
    } catch (_) {}
    var txt = normalizar(partes.filter(Boolean).join(' | ')).replace(/[^a-z0-9]+/g, ' ')
    var casou = null
    var termo = ''
    for (var i = 0; i < REGRAS.length && !casou; i++) {
      var r = REGRAS[i]
      for (var j = 0; j < r.termos.length && !casou; j++) {
        var padrao = normalizar(r.termos[j]).trim().split(/\s+/).join('\\s+')
        if (new RegExp('(^| )' + padrao, 'i').test(txt)) {
          casou = r
          termo = r.termos[j]
        }
      }
    }
    if (casou) {
      rec.set('ncm', casou.ncm)
      rec.set('ncm_origem', 'automatica')
      rec.set('ncm_confianca', 'alta')
      rec.set('ncm_status', 'pronto_nf')
      rec.set(
        'ncm_justificativa',
        String('Regra: ' + casou.rotulo + ' (palavra-chave "' + termo + '")').slice(0, 500),
      )
      rec.set('ncm_sugerido', '')
      rec.set('ncm_classificado_em', new Date().toISOString())
      app.save(rec)
    }
  } catch (err) {
    console.log('[NCM] Falha na aplicação automática ao BOM ' + bomId + ': ' + String(err))
  }
})
