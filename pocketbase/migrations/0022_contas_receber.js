/*
 * Migration 0022 — Módulo Financeiro: Funcionalidade 1 (CONTAS A RECEBER)
 *
 * Cria a coleção `contas_receber` (uma linha por parcela a receber) e faz o seed
 * do parâmetro de condição de pagamento padrão na coleção `parametros` existente
 * (chave `condicao_pagamento_padrao`, sem mexer nos parâmetros de markup).
 *
 * A coleção guarda o snapshot dos dados do cliente e da origem (proposta e
 * faturamento FT-AAAA-NNNN) para que o extrato não dependa de expand de
 * múltiplas coleções (evita rajadas de requests e 429).
 *
 * Regras de acesso: EXCLUSIVO DO ADMIN (list/view/create/update/delete).
 */
migrate(
  (app) => {
    // ------------------------------------------------------------------
    // 1. Coleção contas_receber
    // ------------------------------------------------------------------
    let col
    try {
      col = app.findCollectionByNameOrId('contas_receber')
    } catch (_) {
      col = null
    }
    if (!col) {
      const propostasCol = app.findCollectionByNameOrId('propostas')
      const faturamentosCol = app.findCollectionByNameOrId('faturamentos')
      const clientesCol = app.findCollectionByNameOrId('clientes')
      const usersCol = app.findCollectionByNameOrId('users')

      const adminOnly = "@request.auth.id != '' && @request.auth.perfil = 'admin'"

      col = new Collection({
        name: 'contas_receber',
        type: 'base',
        listRule: adminOnly,
        viewRule: adminOnly,
        createRule: adminOnly,
        updateRule: adminOnly,
        deleteRule: adminOnly,
        fields: [
          {
            name: 'faturamento',
            type: 'relation',
            required: true,
            collectionId: faturamentosCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'proposta',
            type: 'relation',
            required: false,
            collectionId: propostasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'cliente',
            type: 'relation',
            required: false,
            collectionId: clientesCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          // Snapshots textuais (evita joins/expands na listagem)
          { name: 'faturamento_numero', type: 'text', max: 40 },
          { name: 'proposta_numero', type: 'text', max: 40 },
          { name: 'cliente_nome', type: 'text', max: 200 },
          { name: 'cliente_cnpj', type: 'text', max: 32 },
          { name: 'condicao_pagamento', type: 'text', max: 200 },
          { name: 'numero_parcela', type: 'number', onlyInt: true },
          { name: 'total_parcelas', type: 'number', onlyInt: true },
          { name: 'valor_parcela', type: 'number' },
          { name: 'valor_recebido', type: 'number' },
          { name: 'vencimento', type: 'date' },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['pendente', 'pago'],
            maxSelect: 1,
          },
          { name: 'data_recebimento', type: 'date' },
          { name: 'forma_pagamento', type: 'text', max: 60 },
          { name: 'observacoes', type: 'text', max: 2000 },
          {
            name: 'criador',
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
          'CREATE INDEX idx_contas_receber_status ON contas_receber (status)',
          'CREATE INDEX idx_contas_receber_vencimento ON contas_receber (vencimento)',
          'CREATE INDEX idx_contas_receber_faturamento ON contas_receber (faturamento)',
        ],
      })
      app.save(col)
    }

    // ------------------------------------------------------------------
    // 2. Seed do parâmetro de condição de pagamento padrão
    //    (coleção `parametros` existente — sem mexer nas outras linhas)
    // ------------------------------------------------------------------
    let existeParam = null
    try {
      existeParam = app.findFirstRecordByData('parametros', 'chave', 'condicao_pagamento_padrao')
    } catch (_) {
      existeParam = null
    }
    if (!existeParam) {
      const paramsCol = app.findCollectionByNameOrId('parametros')
      const rec = new Record(paramsCol)
      rec.set('chave', 'condicao_pagamento_padrao')
      rec.set('nome', 'Condição de Pagamento Padrão')
      rec.set('valor_percentual', 0)
      rec.set(
        'descricao',
        'Texto da condição usada nos contratos e na geração de parcelas do Contas a Receber',
      )
      rec.set('ordem', 5)
      app.save(rec)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('contas_receber')
      app.delete(col)
    } catch (_) {}
    try {
      const param = app.findFirstRecordByData('parametros', 'chave', 'condicao_pagamento_padrao')
      if (param) app.delete(param)
    } catch (_) {}
  },
)
