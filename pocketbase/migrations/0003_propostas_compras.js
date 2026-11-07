migrate(
  (app) => {
    // --- propostas ---
    const propostas = new Collection({
      name: 'propostas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'numero', type: 'text', required: false },
        { name: 'cliente', type: 'text', required: false },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['rascunho', 'enviada', 'vendida'],
          maxSelect: 1,
        },
        { name: 'valor_total', type: 'number', required: false },
        { name: 'observacoes', type: 'text', required: false },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: ['CREATE INDEX idx_propostas_status ON propostas (status)'],
    })
    app.save(propostas)

    // --- proposta_items ---
    const propostaItems = new Collection({
      name: 'proposta_items',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'proposta_id',
          type: 'relation',
          required: true,
          collectionId: app.findCollectionByNameOrId('propostas').id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'bom_id',
          type: 'relation',
          required: true,
          collectionId: app.findCollectionByNameOrId('boms').id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'sku', type: 'text', required: true },
        { name: 'nome_produto', type: 'text', required: false },
        { name: 'quantidade', type: 'number', required: false },
        { name: 'preco_unitario', type: 'number', required: false },
        { name: 'custo_unitario', type: 'number', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_proposta_items_proposta ON proposta_items (proposta_id)',
        'CREATE INDEX idx_proposta_items_bom ON proposta_items (bom_id)',
      ],
    })
    app.save(propostaItems)

    // --- ordens_compra ---
    const ordens = new Collection({
      name: 'ordens_compra',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'numero', type: 'text', required: false },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pendente', 'parcial', 'concluida'],
          maxSelect: 1,
        },
        { name: 'custo_total', type: 'number', required: false },
        {
          name: 'proposta_id',
          type: 'relation',
          required: false,
          collectionId: app.findCollectionByNameOrId('propostas').id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_ordens_compra_status ON ordens_compra (status)'],
    })
    app.save(ordens)

    // --- ordem_compra_itens ---
    const ordemItens = new Collection({
      name: 'ordem_compra_itens',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'ordem_id',
          type: 'relation',
          required: true,
          collectionId: app.findCollectionByNameOrId('ordens_compra').id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'codigo', type: 'text', required: true },
        { name: 'descricao', type: 'text', required: true },
        { name: 'categoria', type: 'text', required: false },
        { name: 'unidade', type: 'text', required: false },
        { name: 'fornecedor', type: 'text', required: false },
        { name: 'quantidade', type: 'number', required: false },
        { name: 'custo_unitario', type: 'number', required: false },
        { name: 'custo_total', type: 'number', required: false },
        {
          name: 'comprado',
          type: 'bool',
          required: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_ordem_compra_itens_ordem ON ordem_compra_itens (ordem_id)'],
    })
    app.save(ordemItens)
  },
  (app) => {
    // down: reverter criando as coleções
    const names = ['ordem_compra_itens', 'ordens_compra', 'proposta_items', 'propostas']
    for (const name of names) {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    }
  },
)
