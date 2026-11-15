/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook: CONTAS A RECEBER — geração automática de parcelas.
 *
 * Quando um faturamento (pré-nota) passa a status `emitido` (onRecordUpdate de
 * `faturamentos`), gera as parcelas em `contas_receber` conforme a condição de
 * pagamento:
 *   - Condição vem do CONTRATO da proposta (campo condicao_pagamento).
 *   - Condição "à vista" (ou sem contrato/condição) = 1 parcela, vencimento na
 *     data de emissão.
 *   - Condições parceladas = 2/3/4 parcelas com vencimentos em 30/60/90/120
 *     dias após a emissão (prazos configuráveis pelo admin em `parametros`,
 *     chaves financeiro_condicao_avista/30/60/90/120 — valor_percentual = dias).
 *   - Condições livres ("40% sinal...", "50/50") caem no reconhecimento por
 *     texto: "sinal", "à vista", "entrada" ou "na entrega" => à vista;
 *     "30/60", "parcelado", "30 dias", "60 dias" => parcelado conforme dias.
 *
 * Padrão do projeto: e.next() primeiro, mutação via e.app depois (sem loop de
 * gravação: contas_receber não tem hooks). Guarda de idempotência: se já
 * existem parcelas NÃO canceladas para o faturamento, NÃO regenera.
 * Exclusivo do admin: as regras da coleção já são admin-only (RLS).
 *
 * IMPORTANTE (JSVM): callbacks rodam em pool separado — TODA a lógica vive
 * DENTRO do callback (nenhuma função/variável global é referenciada).
 */

onRecordUpdate('faturamentos', (e) => {
  e.next()

  const app = e.app
  const rec = e.record

  try {
    const status = rec.getString('status') || ''
    if (status !== 'emitido') return

    // ---- idempotência: já existem parcelas vivas para este faturamento? -----
    const existentes = app.findRecordsByFilter(
      'contas_receber',
      "faturamento = '" + rec.id + "' && status != 'cancelado'",
      'numero_parcela',
      1,
      0,
    )
    if (existentes.length > 0) {
      console.log('[FINANCEIRO] Faturamento ' + rec.id + ' já possui parcelas — nada a gerar.')
      return
    }

    // --------------------------- dados base ---------------------------------
    const valorTotal = rec.getFloat('valor_total') || 0
    if (valorTotal <= 0) {
      console.log('[FINANCEIRO] Faturamento ' + rec.id + ' sem valor — parcelas não geradas.')
      return
    }

    const dataEmissao = rec.getString('data_emissao') || new Date().toISOString().slice(0, 10)
    const emissao = new Date(dataEmissao + 'T00:00:00Z')

    const clienteId = rec.getString('cliente') || ''
    const clienteNome = rec.getString('cliente_razao_social') || ''
    const clienteCnpj = rec.getString('cliente_cnpj') || ''
    const propostaId = rec.getString('proposta') || ''
    const faturamentoNumero = rec.getString('numero') || ''
    const criador = rec.getString('criador') || ''

    // ------------------- condição de pagamento da proposta ------------------
    let condicaoTexto = ''
    if (propostaId) {
      const contratos = app.findRecordsByFilter(
        'contratos',
        "proposta = '" + propostaId + "'",
        '-created',
        1,
        0,
      )
      if (contratos.length > 0) condicaoTexto = contratos[0].getString('condicao_pagamento') || ''
    }
    const condicaoLower = (condicaoTexto || '').toLowerCase()

    // ---------------- prazos configuráveis (coleção parametros) -------------
    function prazoDias(chave, padrao) {
      try {
        const p = app.findFirstRecordByData('parametros', 'chave', chave)
        if (!p) return padrao
        const v = p.getFloat('valor_percentual')
        return v > 0 ? v : padrao
      } catch (_) {
        return padrao
      }
    }
    const DIAS = {
      avista: prazoDias('financeiro_condicao_avista', 0),
      d30: prazoDias('financeiro_condicao_30', 30),
      d60: prazoDias('financeiro_condicao_60', 60),
      d90: prazoDias('financeiro_condicao_90', 90),
      d120: prazoDias('financeiro_condicao_120', 120),
    }

    // ------------------- interpretar a condição ------------------------------
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
    const cNorm = normalizar(condicaoLower)

    // Prazos citados explicitamente no texto ("30/60", "30 e 60 dias"...)
    const prazosTexto = []
    const regexPrazos = /(\d{1,3})\s*(?:\/|,|e|a)\s*(\d{1,3})/g
    let m
    while ((m = regexPrazos.exec(cNorm)) !== null) {
      if (!prazosTexto.includes(parseInt(m[1], 10))) prazosTexto.push(parseInt(m[1], 10))
      if (!prazosTexto.includes(parseInt(m[2], 10))) prazosTexto.push(parseInt(m[2], 10))
    }
    const regexDias = /(\d{1,3})\s*dias/g
    while ((m = regexDias.exec(cNorm)) !== null) {
      if (!prazosTexto.includes(parseInt(m[1], 10))) prazosTexto.push(parseInt(m[1], 10))
    }
    prazosTexto.sort(function (a, b) {
      return a - b
    })

    let parcelas = [] // { dias, fracao }
    const ehAvistaPorTexto =
      prazosTexto.length === 0 && /avista|sinal|entrada|na entrega|no ato|vista\b/.test(cNorm)
    const soUmPrazo = prazosTexto.length === 1 && prazosTexto[0] <= 120

    if (condicaoTexto === '' || ehAvistaPorTexto || (soUmPrazo && prazosTexto[0] === DIAS.avista)) {
      // À vista: 1 parcela na data de emissão
      parcelas = [{ dias: 0, fracao: 1 }]
    } else if (prazosTexto.length >= 2 && prazosTexto[prazosTexto.length - 1] <= 120) {
      // Texto cita prazos explícitos: usa exatamente eles (30/60 etc.)
      parcelas = prazosTexto.map(function (d) {
        return { dias: d, fracao: 1 / prazosTexto.length }
      })
    } else {
      // Sem prazos claros: casa com a condição configurada mais próxima
      if (prazosTexto.length === 1) {
        const d = prazosTexto[0]
        parcelas = [{ dias: d, fracao: 1 }]
      } else {
        // Condição livre sem prazos numéricos (ex: "50/50"): tratar como à vista
        parcelas = [{ dias: 0, fracao: 1 }]
      }
    }

    // ------------------------- gerar as parcelas -----------------------------
    const formaDefault = condicaoTexto || 'À vista'
    for (let i = 0; i < parcelas.length; i++) {
      const p = parcelas[i]
      const venc = new Date(emissao.getTime() + p.dias * 24 * 60 * 60 * 1000)
      const valorParcela = Math.round(valorTotal * p.fracao * 100) / 100
      // Arredondamento: a última parcela absorve centavos residuais
      const isUltima = i === parcelas.length - 1

      const colParcelas = app.findCollectionByNameOrId('contas_receber')
      const nova = new Record(colParcelas)
      nova.set('faturamento', rec.id)
      nova.set('proposta', propostaId)
      nova.set('cliente', clienteId)
      nova.set('faturamento_numero', faturamentoNumero)
      nova.set('proposta_numero', rec.getString('proposta_numero') || '')
      nova.set('cliente_nome', clienteNome)
      nova.set('cliente_cnpj', clienteCnpj)
      nova.set('condicao_pagamento', condicaoTexto || 'À vista')
      nova.set('numero_parcela', i + 1)
      nova.set('total_parcelas', parcelas.length)
      nova.set(
        'valor_parcela',
        isUltima && parcelas.length > 1
          ? Math.round((valorTotal - somaJaParcelada) * 100) / 100
          : valorParcela,
      )
      nova.set('valor_recebido', 0)
      nova.set('vencimento', venc.toISOString().replace('Z', '+00:00'))
      nova.set('status', 'pendente')
      nova.set('forma_pagamento', formaDefault)
      nova.set('criador', criador)
      app.save(nova)
      somaJaParcelada += valorParcela
    }

    console.log(
      '[FINANCEIRO] Geradas ' +
        parcelas.length +
        ' parcela(s) para o faturamento ' +
        faturamentoNumero +
        ' (condição: ' +
        (condicaoTexto || 'À vista') +
        ').',
    )
  } catch (err) {
    console.log('[FINANCEIRO] Erro ao gerar parcelas do faturamento ' + rec.id + ': ' + String(err))
  }
})
