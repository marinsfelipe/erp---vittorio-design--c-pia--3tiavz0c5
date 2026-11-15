/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook: COMISSÕES — geração automática quando a proposta vira `vendida`.
 *
 * Mesmo padrão de contas_receber.pb.js: e.next() primeiro, mutação via e.app
 * depois, lógica toda dentro do callback (JSVM), guarda de idempotência
 * (não duplica comissão por proposta) e captura do criador ANTES de qualquer
 * trabalho em segundo plano.
 *
 * Regra de valor: percentual do vendedor (campo `percentual_comissao`, lido de
 * usuarios_perfil com fallback em users) × TOTAL FINAL LÍQUIDO da proposta
 * (campo valor_total, já com descontos de itens e geral aplicados).
 */
onRecordUpdate('propostas', (e) => {
  e.next()

  const app = e.app
  const rec = e.record

  try {
    const status = rec.getString('status') || ''
    if (status !== 'vendida') return

    // --------------------------- idempotência -------------------------------
    const existentes = app.findRecordsByFilter(
      'comissoes',
      "proposta = '" + rec.id + "' && status != 'cancelada'",
      '',
      1,
      0,
    )
    if (existentes.length > 0) return

    // ------------------------------ dados -----------------------------------
    const vendedor = rec.getString('criador') || ''
    if (!vendedor) {
      console.log('[COMISSOES] Proposta ' + rec.id + ' sem criador — comissão não gerada.')
      return
    }

    const valorBase = rec.getFloat('valor_total') || 0
    if (valorBase <= 0) {
      console.log('[COMISSOES] Proposta ' + rec.id + ' sem valor líquido — comissão não gerada.')
      return
    }

    // Percentual do vendedor: usuarios_perfil (fonte principal) com fallback em users
    let pct = 0
    try {
      const p = app.findFirstRecordByData('usuarios_perfil', 'user', vendedor)
      if (p) pct = p.getFloat('percentual_comissao') || 0
    } catch (_) {}
    if (pct <= 0) {
      try {
        const u = app.findRecordById('users', vendedor)
        pct = u.getFloat('percentual_comissao') || 0
      } catch (_) {}
    }
    if (pct <= 0) {
      console.log(
        '[COMISSOES] Vendedor ' + vendedor + ' sem percentual_comissao — comissão não gerada.',
      )
      return
    }

    // Snapshots em texto (mesmo padrão de contas_receber/contas_pagar)
    let numero = ''
    let clienteNome = ''
    try {
      numero = rec.getString('numero') || ''
    } catch (_) {}
    try {
      clienteNome = rec.getString('cliente_nome') || ''
    } catch (_) {}

    const colComissoes = app.findCollectionByNameOrId('comissoes')
    const nova = new Record(colComissoes)
    nova.set('vendedor', vendedor)
    nova.set('proposta', rec.id)
    nova.set('proposta_numero', numero)
    nova.set('cliente_nome', clienteNome)
    nova.set('valor_base', valorBase)
    nova.set('percentual', pct)
    nova.set('valor', Math.round(((valorBase * pct) / 100) * 100) / 100)
    nova.set('status', 'prevista')
    nova.set('criado_por', vendedor)
    app.save(nova)

    console.log(
      '[COMISSOES] Comissão prevista gerada para a proposta ' +
        (numero || rec.id) +
        ' (' +
        pct +
        '% de R$ ' +
        valorBase.toFixed(2) +
        ').',
    )
  } catch (err) {
    console.log('[COMISSOES] Erro ao gerar comissão da proposta ' + rec.id + ': ' + String(err))
  }
})
