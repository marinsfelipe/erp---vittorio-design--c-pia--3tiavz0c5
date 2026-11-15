/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook: MÓDULO FISCAL — impostos estimados por regime tributário.
 *
 * ROTA (contrato mantido — chamada no front via pb.send):
 *   POST /backend/v1/custom/fiscal/impostos  (apenas admin)
 *     body: { faturamento: '<id>' }
 *
 * Regime lido do cadastro da EMPRESA (coleção `empresa`, 1 registro; fallback:
 * parâmetro `fiscal_regime` em `parametros`):
 *   - 'simples'   → RBT12 (soma dos faturamentos 'emitido' dos últimos 12
 *     meses FECHADOS; com menos de 12 meses, média mensal × 12) e alíquota
 *     efetiva pelas 6 faixas do Anexo II (indústria) — DAS estimado.
 *   - 'presumido' → PIS 0,65% + COFINS 3% + ICMS (interna por UF do cliente
 *     via fiscal_icms_uf_xx; interestadual 12% via fiscal_icms_interestadual)
 *     + IPI 5% quando o NCM do produto está na lista fiscal_ipi_ncm_5.
 *
 * Parâmetros fiscal_* ficam em `parametros` FORA do markup divisor (mesmo
 * padrão dos financeiro_*). Grava snapshot em impostos_estimados /
 * valor_liquido / regime_tributario / impostos_detalhe no faturamento.
 *
 * ESTIMATIVA: não emite NF-e e não substitui o contador.
 *
 * IMPORTANTE (JSVM): callbacks rodam em pool separado — TODA a lógica vive
 * DENTRO do callback (nenhuma função/variável global é referenciada).
 * Padrão: e.next() não se aplica aqui (rota custom); leitura + save único.
 */

routerAdd(
  'POST',
  '/backend/v1/custom/fiscal/impostos',
  (e) => {
    const app = e.app
    const info = e.requestInfo()

    // --------------------- helpers (locais ao callback) ---------------------
    function regimeEmpresa() {
      try {
        const recs = app.findRecordsByFilter('empresa', '', '', 1, 0)
        if (recs.length > 0) return (recs[0].getString('regime') || '').toLowerCase()
      } catch (_) {}
      try {
        const p = app.findFirstRecordByData('parametros', 'chave', 'fiscal_regime')
        if (p) return (p.getString('valor_texto') || '').toLowerCase()
      } catch (_) {}
      return ''
    }

    function parametroNum(chave, padrao) {
      try {
        const p = app.findFirstRecordByData('parametros', 'chave', chave)
        if (p) {
          const v = p.getFloat('valor_percentual')
          if (!isNaN(v) && v !== 0) return v
        }
      } catch (_) {}
      return padrao
    }

    function ufEmpresa() {
      try {
        const recs = app.findRecordsByFilter('empresa', '', '', 1, 0)
        if (recs.length > 0) return (recs[0].getString('uf') || '').toUpperCase()
      } catch (_) {}
      return ''
    }

    function listaNcmIpi5() {
      try {
        const p = app.findFirstRecordByData('parametros', 'chave', 'fiscal_ipi_ncm_5')
        if (p) {
          return (p.getString('valor_texto') || '')
            .split(',')
            .map(function (s) {
              return s.trim().replace(/\D/g, '')
            })
            .filter(Boolean)
        }
      } catch (_) {}
      return []
    }

    // NCMs sujeitos a SUBSTITUIÇÃO TRIBUTÁRIA (parametro fiscal_st_ncm,
    // texto CSV — migração 0028). Compara pelos dígitos (aceita 8418.50.90
    // ou 84185090 gravado).
    function listaNcmSt() {
      try {
        const p = app.findFirstRecordByData('parametros', 'chave', 'fiscal_st_ncm')
        if (p) {
          return (p.getString('valor_texto') || '')
            .split(',')
            .map(function (s) {
              return s.trim().replace(/\D/g, '')
            })
            .filter(Boolean)
        }
      } catch (_) {}
      return []
    }

    // CFOP sugerido: dentro do estado 5.102 / interestadual 6.102; com item
    // de substituição tributária vira 5.405 / 6.405 (só sugere — o admin
    // confirma com o contador e pode editar).
    function cfopSugerido(mesmaUf, temSt) {
      if (temSt) return mesmaUf ? '5.405' : '6.405'
      return mesmaUf ? '5.102' : '6.102'
    }

    // Fiscal F4 — itens SEM NCM (pendente fiscal) para o bloqueio de export.
    function itensPendentes(produtos, ncmPorSku) {
      const out = []
      for (const p of produtos) {
        const sku = String(p.sku || '')
        const ncmItem = String(p.ncm || '').trim()
        const ncmBom = String(ncmPorSku[sku] || '').trim()
        if (!ncmItem && !ncmBom) {
          out.push({
            sku: sku,
            descricao: String(p.descricao || p.nome_produto || '').trim(),
          })
        }
      }
      return out
    }

    function arred(v) {
      return Math.round(v * 100) / 100
    }

    function lerFaixasAnexo2() {
      // Tabela padrão do Anexo II (indústria) — editável pelo admin em
      // /fiscal (chaves fiscal_anexo2_faixa<i>_{limite,aliquota,deducao}).
      const padrao = [
        { limite: 180000, aliquota: 4.5, deducao: 0 },
        { limite: 360000, aliquota: 7.8, deducao: 5940 },
        { limite: 720000, aliquota: 10.0, deducao: 20400 },
        { limite: 1800000, aliquota: 11.2, deducao: 86400 },
        { limite: 3600000, aliquota: 14.7, deducao: 428400 },
        { limite: 4800000, aliquota: 30.0, deducao: 7214400 },
      ]
      const faixas = []
      for (let i = 1; i <= 6; i++) {
        faixas.push({
          limite: parametroNum('fiscal_anexo2_faixa' + i + '_limite', padrao[i - 1].limite),
          aliquota: parametroNum('fiscal_anexo2_faixa' + i + '_aliquota', padrao[i - 1].aliquota),
          deducao: parametroNum('fiscal_anexo2_faixa' + i + '_deducao', padrao[i - 1].deducao),
        })
      }
      return faixas
    }

    function aliquotaAnexo2(rbt12, faixas) {
      for (const f of faixas) {
        if (rbt12 <= f.limite) {
          // Alíquota efetiva = (RBT12 × alíquota nominal − dedução) / RBT12
          const efetiva = (rbt12 * (f.aliquota / 100) - f.deducao) / Math.max(rbt12, 1)
          return Math.max(0, Math.round(efetiva * 10000) / 100) // % com 2 casas
        }
      }
      // Acima da última faixa: fora do Simples — usa a última nominal.
      const last = faixas[faixas.length - 1]
      return last ? last.aliquota : 0
    }

    function calcularSimples(valorTotal, fat) {
      // --------------------------- RBT12 ------------------------------------
      const hoje = fat.getString('data_emissao') || new Date().toISOString().slice(0, 10)
      const mesAtual = hoje.slice(0, 7) // AAAA-MM
      const inicio = new Date(mesAtual + '-01T00:00:00Z')
      inicio.setUTCMonth(inicio.getUTCMonth() - 12)
      const mesInicio = inicio.toISOString().slice(0, 7)
      // Faturamentos 'emitido' dos 12 meses FECHADOS anteriores (1 listagem
      // única — sem rajada de requests). Exclui o próprio registro.
      const receitas = []
      try {
        const lista = app.findRecordsByFilter(
          'faturamentos',
          "status = 'emitido'",
          '-data_emissao',
          0,
          0,
        )
        for (const f of lista) {
          if (f.id === fat.id) continue
          const mes = (f.getString('data_emissao') || '').slice(0, 7)
          if (!mes || mes >= mesAtual || mes < mesInicio) continue
          receitas.push(f.getFloat('valor_total') || 0)
        }
      } catch (_) {}

      // Com menos de 12 meses de histórico, proporcionaliza: média × 12.
      let rbt12 = 0
      if (receitas.length > 0) {
        const soma = receitas.reduce(function (a, b) {
          return a + b
        }, 0)
        const media = soma / receitas.length
        rbt12 = receitas.length >= 12 ? soma : media * 12
      }

      const faixas = lerFaixasAnexo2()
      const aliquotaEfetiva = aliquotaAnexo2(rbt12, faixas)
      const das = arred(valorTotal * (aliquotaEfetiva / 100))
      return {
        total: das,
        liquido: arred(valorTotal - das),
        rbt12: arred(rbt12),
        detalhe: { DAS: das, aliquota_efetiva_pct: aliquotaEfetiva, rbt12: arred(rbt12) },
      }
    }

    function calcularPresumido(valorTotal, ufCliente, produtos, ncmPorSku) {
      const pis = valorTotal * (parametroNum('fiscal_pis', 0.65) / 100)
      const cofins = valorTotal * (parametroNum('fiscal_cofins', 3.0) / 100)

      // ----------------------------- ICMS -----------------------------------
      // Interna: alíquota da UF do cliente (fiscal_icms_uf_xx, default 18%).
      // Interestadual: fiscal_icms_interestadual (12% padrão; 4% é caso
      // especial de mercadoria importada — o admin ajusta a chave).
      const ufEmp = ufEmpresa()
      const isMesmaUf = !!ufCliente && ufCliente === ufEmp
      const chaveUf = 'fiscal_icms_uf_' + (ufCliente || 'xx').toLowerCase()
      const icmsPct = isMesmaUf
        ? parametroNum(chaveUf, 18)
        : parametroNum('fiscal_icms_interestadual', 12)
      const icms = valorTotal * (icmsPct / 100)

      // ------------------------------ IPI -----------------------------------
      // IPI por NCM: fiscal_ipi (5% padrão) quando o NCM do produto está na
      // lista fiscal_ipi_ncm_5 (texto CSV, vazia por padrão); 0% caso contrário.
      const lista5 = listaNcmIpi5()
      const ipiPct = parametroNum('fiscal_ipi', 5)
      let ipi = 0
      for (const p of produtos) {
        const ncm = String(ncmPorSku[String(p.sku || '')] || '').replace(/\D/g, '')
        if (ncm && lista5.indexOf(ncm) >= 0) {
          ipi += (p.getFloat ? p.getFloat('valor_total') : p.valor_total || 0) * (ipiPct / 100)
        }
      }

      const total = arred(pis + cofins + icms + ipi)
      return {
        total: total,
        liquido: arred(valorTotal - total),
        rbt12: 0,
        detalhe: {
          PIS: arred(pis),
          COFINS: arred(cofins),
          ICMS: arred(icms),
          IPI: arred(ipi),
          icms_pct: icmsPct,
          ipi_pct: ipiPct,
          uf_cliente: ufCliente,
          uf_empresa: ufEmp,
          mesma_uf: isMesmaUf,
        },
      }
    }

    // ---------------------- bloqueio no backend (admin) --------------------
    const auth = info.auth
    if (!auth) {
      return e.json(401, { error: 'Autenticação obrigatória.' })
    }
    let perfil = ''
    try {
      const p = app.findFirstRecordByData('usuarios_perfil', 'user', auth.id)
      if (p) perfil = p.getString('perfil') || ''
    } catch (_) {}
    if (!perfil) {
      try {
        perfil = auth.get('perfil') || ''
      } catch (_) {}
    }
    if (perfil !== 'admin') {
      return e.json(403, { error: 'Módulo Fiscal restrito a administradores.' })
    }

    // ----------------------------- entrada ---------------------------------
    const body = info.body || {}
    const fatId = String(body.faturamento || '')
    if (!fatId) {
      return e.json(400, { error: 'Informe o faturamento.' })
    }

    let fat = null
    try {
      fat = app.findRecordById('faturamentos', fatId)
    } catch (_) {
      return e.json(404, { error: 'Faturamento não encontrado.' })
    }

    const valorTotal = fat.getFloat('valor_total') || 0
    const ufCliente = (fat.getString('cliente_uf') || '').toUpperCase()
    const regime = regimeEmpresa(app)

    // ------------- produtos do faturamento e NCM por SKU --------------------
    // Shape real do campo produtos (JSON): [{ sku, nome_produto, quantidade,
    // preco_unitario, valor_total }] — ver migração 0010_faturamentos.js.
    let produtos = []
    try {
      const raw = fat.get('produtos')
      produtos = Array.isArray(raw) ? raw : []
    } catch (_) {
      produtos = []
    }
    const skus = []
    for (const p of produtos) {
      const sku = String(p.sku || '').trim()
      if (sku && skus.indexOf(sku) < 0) skus.push(sku)
    }
    // 1 listagem única de boms filtrada pelos SKUs (sem rajada por registro).
    const ncmPorSku = {}
    if (skus.length > 0) {
      try {
        const filtro =
          'sku IN (' + skus.map((s) => "'" + s.replace(/'/g, "''") + "'").join(',') + ')'
        const lista = app.findRecordsByFilter('boms', filtro, '', 0, 0)
        for (const b of lista) {
          const ncm = (b.getString('ncm') || '').trim()
          if (ncm) ncmPorSku[b.getString('sku')] = ncm
        }
      } catch (_) {}
    }

    // Fiscal F4: unidade e origem do NCM por SKU (mesma listagem única, sem
    // rajada) — a planilha da pré-nota usa essas colunas.
    const unidadePorSku = {}
    const origemPorSku = {}
    if (skus.length > 0) {
      try {
        const filtro =
          'sku IN (' + skus.map((s) => "'" + s.replace(/'/g, "''") + "'").join(',') + ')'
        const lista = app.findRecordsByFilter('boms', filtro, '', 0, 0)
        for (const b of lista) {
          const sku = b.getString('sku')
          const un = (b.getString('unidade') || '').trim()
          if (un) unidadePorSku[sku] = un
          const og = (b.getString('ncm_origem') || '').trim()
          if (og) origemPorSku[sku] = og
        }
      } catch (_) {}
    }

    const resultado =
      regime === 'simples'
        ? calcularSimples(valorTotal, fat)
        : calcularPresumido(valorTotal, ufCliente, produtos, ncmPorSku)

    // ---------------------- CFOP automático + CEST --------------------------
    // Produtos finais com item sujeito a ST (lista fiscal_st_ncm) mudam o
    // CFOP sugerido para 5.405/6.405. CEST por SKU vem da coleção `boms`
    // (campo cest, migração 0028). Só grava CFOP se o admin não editou —
    // CFOP em branco OU sugestão nova quando o gravado é o padrão anterior.
    const ufEmp = ufEmpresa()
    const mesmaUf = !!ufCliente && ufCliente === ufEmp
    const listaSt = listaNcmSt()
    let temSt = false
    const itensSt = []
    for (const p of produtos) {
      const sku = String(p.sku || '')
      const ncm = String(ncmPorSku[sku] || '').replace(/\D/g, '')
      if (ncm && listaSt.indexOf(ncm) >= 0) {
        temSt = true
        itensSt.push({ sku: sku, ncm: ncm })
      }
    }
    const cfopNovo = cfopSugerido(mesmaUf, temSt)

    // CEST por SKU (1 listagem única dos SKUs — sem rajada de requests).
    const cestPorSku = {}
    if (skus.length > 0) {
      try {
        const filtroCest =
          'sku IN (' + skus.map((s) => "'" + s.replace(/'/g, "''") + "'").join(',') + ')'
        const listaBoms = app.findRecordsByFilter('boms', filtroCest, '', 0, 0)
        for (const b of listaBoms) {
          const c = (b.getString('cest') || '').trim()
          if (c) cestPorSku[b.getString('sku')] = c
        }
      } catch (_) {}
    }

    // ---- snapshot nos campos do próprio faturamento (admin-only via RLS) ---
    try {
      fat.set('impostos_estimados', resultado.total)
      fat.set('valor_liquido', resultado.liquido)
      fat.set('regime_tributario', regime === 'simples' ? 'simples' : 'presumido')
      fat.set('impostos_detalhe', JSON.stringify(resultado.detalhe || {}))
      // CFOP: só grava quando em branco OU quando o gravado é outra sugestão
      // automática (5.x/6.x) — a edição manual do admin nunca é sobrescrita.
      const cfopGravado = (fat.getString('cfop') || '').trim()
      if (!cfopGravado || /^(5|6)\.(102|405)$/.test(cfopGravado)) {
        fat.set('cfop', cfopNovo)
      }
      // Fiscal F2: grava NCM/CEST por item em `produtos` (JSON) — a planilha
      // .xlsx para a contabilidade lê esses campos por item.
      let produtosAlterados = false
      for (const p of produtos) {
        const sku = String(p.sku || '')
        const ncmFmt = String(ncmPorSku[sku] || '').trim()
        const cestFmt = String(cestPorSku[sku] || '').trim()
        if (ncmFmt && p.ncm !== ncmFmt) {
          p.ncm = ncmFmt
          produtosAlterados = true
        }
        if (cestFmt && !p.cest) {
          p.cest = cestFmt
          produtosAlterados = true
        }
      }
      // Fiscal F4: grava unidade/origem do NCM nos itens do JSON `produtos`
      // quando o cadastro do BOM tem o dado — a planilha lê por item.
      for (const p of produtos) {
        const sku = String(p.sku || '')
        const un = String(unidadePorSku[sku] || '').trim()
        const og = String(origemPorSku[sku] || '').trim()
        if (un && p.unidade !== un) {
          p.unidade = un
          produtosAlterados = true
        }
        if (og && p.ncm_origem !== og) {
          p.ncm_origem = og
          produtosAlterados = true
        }
      }
      if (produtosAlterados) {
        fat.set('produtos', JSON.stringify(produtos))
      }
      app.save(fat)
    } catch (err) {
      console.log('[FISCAL] Snapshot no faturamento ' + fatId + ' falhou: ' + String(err))
    }

    console.log(
      '[FISCAL] Impostos estimados do faturamento ' +
        (fat.getString('numero') || fatId) +
        ' (regime ' +
        regime +
        '): total R$ ' +
        resultado.total +
        ' / líquido R$ ' +
        resultado.liquido +
        ' / CFOP ' +
        cfopNovo +
        (temSt ? ' (item com ST)' : ''),
    )

    return e.json(200, {
      ok: true,
      regime: regime === 'simples' ? 'Simples Nacional' : 'Lucro Presumido',
      rbt12: resultado.rbt12 || 0,
      impostos: resultado.detalhe || {},
      total: resultado.total,
      liquido: resultado.liquido,
      // ---- Fiscal F2: CFOP sugerido + substituição tributária ----
      cfop: cfopNovo,
      mesma_uf: mesmaUf,
      uf_empresa: ufEmp,
      st: temSt,
      st_itens: itensSt,
      cest: cestPorSku,
      cest_sugerido: '21.007.00',
      // ---- Fiscal F4: colunas fiscais por item + pendências (bloqueio) ----
      unidade: unidadePorSku,
      ncm_origem: origemPorSku,
      pendentes_fiscais: itensPendentes(produtos, ncmPorSku),
      aviso: 'ESTIMATIVA — apuração oficial pelo contador',
    })
  },
  $apis.requireAuth(),
)
