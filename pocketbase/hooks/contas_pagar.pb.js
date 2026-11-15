/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook: CONTAS A PAGAR — geração automática a partir das ordens de compra.
 *
 * Quando uma ordem de compra do módulo Compras é CONCLUÍDA (status muda para
 * `concluida` — equivalente ao `emitido` do faturamento; é o estado que o
 * módulo Compras grava quando todos os itens foram marcados como comprados),
 * gera uma conta a pagar por FORNECEDOR em `contas_pagar`:
 *   - fornecedor = nome do fornecedor dos itens da ordem;
 *   - valor = soma do custo_total dos itens daquele fornecedor;
 *   - vencimento = data de conclusão + prazo padrão configurável em
 *     `parametros` (chave `financeiro_prazo_fornecedor`, valor_percentual =
 *     dias; padrão 30).
 *
 * Idempotência: se já existe conta NÃO cancelada para a mesma ordem +
 * fornecedor, NÃO gera novamente.
 *
 * Padrão do projeto: e.next() primeiro, mutação via e.app depois (sem loop de
 * gravação: contas_pagar não tem hooks). Regras da coleção já são admin-only.
 *
 * IMPORTANTE (JSVM): callbacks rodam em pool separado — TODA a lógica vive
 * DENTRO do callback (nenhuma função/variável global é referenciada).
 */

onRecordUpdate('ordens_compra', (e) => {
  e.next()

  const app = e.app
  const rec = e.record

  try {
    const status = rec.getString('status') || ''
    if (status !== 'concluida') return

    // ---- idempotência: já existem contas vivas para esta ordem? ------------
    const existentes = app.findRecordsByFilter(
      'contas_pagar',
      "ordem_compra = '" + rec.id + "' && status != 'cancelado'",
      'fornecedor',
      1,
      0,
    )
    if (existentes.length > 0) {
      console.log('[FINANCEIRO] Ordem ' + rec.id + ' já possui contas a pagar — nada a gerar.')
      return
    }

    // --------------------------- dados base ---------------------------------
    const numeroOrdem = rec.getString('numero') || ''

    // ordens_compra não tem campo criador — usa o criado_por da proposta de
    // origem; sem proposta, cai para o primeiro admin ativo.
    let criador = ''
    try {
      const propostaId = rec.getString('proposta_id') || ''
      if (propostaId) {
        const proposta = app.findRecordById('propostas', propostaId)
        criador = proposta.getString('criador') || ''
      }
    } catch (_) {
      criador = ''
    }
    if (!criador) {
      try {
        const admins = app.findRecordsByFilter('users', "perfil = 'admin'", '-created', 1, 0)
        if (admins.length > 0) criador = admins[0].id
      } catch (_) {
        criador = ''
      }
    }
    if (!criador) {
      console.log(
        '[FINANCEIRO] Ordem ' + rec.id + ' sem criador possível — conta a pagar não gerada.',
      )
      return
    }

    const hojeISO = new Date().toISOString().replace('Z', '+00:00')

    // ---------------- prazo configurável (coleção parametros) ---------------
    let prazoDias = 30
    try {
      const p = app.findFirstRecordByData('parametros', 'chave', 'financeiro_prazo_fornecedor')
      if (p) {
        const v = p.getFloat('valor_percentual')
        if (v > 0) prazoDias = v
      }
    } catch (_) {
      prazoDias = 30
    }

    // ---------------- itens agrupados por fornecedor ------------------------
    const itens = app.findRecordsByFilter(
      'ordem_compra_itens',
      "ordem_id = '" + rec.id + "'",
      'codigo',
      500,
      0,
    )
    if (itens.length === 0) {
      console.log('[FINANCEIRO] Ordem ' + rec.id + ' sem itens — conta a pagar não gerada.')
      return
    }

    const porFornecedor = {} // nome -> { total, codigo, descricao, categoria }
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i]
      const forn = (it.getString('fornecedor') || 'Fornecedor Não Definido').trim()
      if (!porFornecedor[forn]) {
        porFornecedor[forn] = {
          total: 0,
          codigo: it.getString('codigo') || '',
          descricao: it.getString('descricao') || '',
          categoria: it.getString('categoria') || 'Insumos',
        }
      }
      porFornecedor[forn].total += it.getFloat('custo_total') || 0
    }

    const vencimento = new Date(Date.now() + prazoDias * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace('Z', '+00:00')

    const colContas = app.findCollectionByNameOrId('contas_pagar')
    let geradas = 0
    for (const forn in porFornecedor) {
      const dados = porFornecedor[forn]
      const total = Math.round(dados.total * 100) / 100
      if (total <= 0) continue

      const descricao =
        'Compra de componentes — ordem ' +
        (numeroOrdem || rec.id) +
        (dados.descricao ? ' (' + dados.descricao + ')' : '')

      const nova = new Record(colContas)
      nova.set('ordem_compra', rec.id)
      nova.set('ordem_numero', numeroOrdem)
      nova.set('fornecedor', forn)
      nova.set('descricao', descricao)
      nova.set('categoria', 'Insumos')
      nova.set('valor', total)
      nova.set('valor_pago', 0)
      nova.set('vencimento', vencimento)
      nova.set('status', 'pendente')
      nova.set('forma_pagamento', '')
      nova.set('observacoes', '')
      nova.set('criado_por', criador)
      app.save(nova)
      geradas++
    }

    console.log(
      '[FINANCEIRO] Geradas ' +
        geradas +
        ' conta(s) a pagar (venc. em ' +
        prazoDias +
        ' dias) para a ordem ' +
        (numeroOrdem || rec.id) +
        '.',
    )
  } catch (err) {
    console.log('[FINANCEIRO] Erro ao gerar contas a pagar da ordem ' + rec.id + ': ' + String(err))
  }
})
