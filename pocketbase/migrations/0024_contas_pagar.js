/*
 * Migration 0024 — Módulo Financeiro: Funcionalidade 2 (CONTAS A PAGAR)
 *
 * Cria a coleção `contas_pagar` (uma linha por conta a pagar a fornecedor ou
 * despesa avulsa) e faz o seed do parâmetro `financeiro_prazo_fornecedor`
 * (prazo padrão em DIAS para vencimento das contas geradas das ordens de
 * compra, configurável pelo admin).
 *
 * A conta guarda o snapshot do fornecedor e o número da ordem em texto para
 * que a listagem não dependa de expand (mesmo padrão de contas_receber).
 *
 * Regras de acesso: EXCLUSIVO DO ADMIN (list/view/create/update/delete).
 */
migrate(
  (app) => {
    // ------------------------------------------------------------------
    // 1. Coleção contas_pagar
    // ------------------------------------------------------------------
    let col
    try {
      col = app.findCollectionByNameOrId('contas_pagar')
    } catch (_) {
      col = null
    }
    if (!col) {
      const ordensCol = app.findCollectionByNameOrId('ordens_compra')
      const usersCol = app.findCollectionByNameOrId('users')

      const adminOnly = "@request.auth.id != '' && @request.auth.perfil = 'admin'"

      col = new Collection({
        name: 'contas_pagar',
        type: 'base',
        listRule: adminOnly,
        viewRule: adminOnly,
        createRule: adminOnly,
        updateRule: adminOnly,
        deleteRule: adminOnly,
        fields: [
          {
            name: 'ordem_compra',
            type: 'relation',
            required: false,
            collectionId: ordensCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'ordem_numero', type: 'text', max: 40 },
          { name: 'fornecedor', type: 'text', max: 200 },
          { name: 'descricao', type: 'text', max: 500 },
          { name: 'categoria', type: 'text', max: 100 },
          { name: 'valor', type: 'number' },
          { name: 'valor_pago', type: 'number' },
          { name: 'vencimento', type: 'date' },
          { name: 'data_pagamento', type: 'date' },
          { name: 'forma_pagamento', type: 'text', max: 60 },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['pendente', 'pago', 'parcial', 'cancelado'],
            maxSelect: 1,
          },
          { name: 'observacoes', type: 'text', max: 2000 },
          {
            name: 'criado_por',
            type: 'relation',
            required: true,
            collectionId: usersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_contas_pagar_status ON contas_pagar (status)',
          'CREATE INDEX idx_contas_pagar_vencimento ON contas_pagar (vencimento)',
          'CREATE INDEX idx_contas_pagar_ordem ON contas_pagar (ordem_compra)',
        ],
      })
      app.save(col)
    }

    // ------------------------------------------------------------------
    // 2. Seed do prazo padrão de pagamento a fornecedores (em dias)
    //    `valor_percentual` guarda o prazo em DIAS (30 por padrão).
    //    Chave financeiro_* administrativa — NÃO entra no markup divisor.
    // ------------------------------------------------------------------
    let existeParam = null
    try {
      existeParam = app.findFirstRecordByData('parametros', 'chave', 'financeiro_prazo_fornecedor')
    } catch (_) {
      existeParam = null
    }
    if (!existeParam) {
      const paramsCol = app.findCollectionByNameOrId('parametros')
      const rec = new Record(paramsCol)
      rec.set('chave', 'financeiro_prazo_fornecedor')
      rec.set('nome', 'Prazo de Pagamento a Fornecedores')
      rec.set('valor_percentual', 30)
      rec.set(
        'descricao',
        'Prazo padrão em DIAS para vencimento das contas a pagar geradas das ordens de compra',
      )
      rec.set('ordem', 6)
      app.save(rec)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('contas_pagar')
      app.delete(col)
    } catch (_) {}
    try {
      const param = app.findFirstRecordByData('parametros', 'chave', 'financeiro_prazo_fornecedor')
      if (param) app.delete(param)
    } catch (_) {}
  },
)
