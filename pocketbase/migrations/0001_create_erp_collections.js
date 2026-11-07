migrate(
  (app) => {
    // 1. Coleção: componentes
    const componentes = new Collection({
      name: 'componentes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'codigo', type: 'text', required: true },
        { name: 'descricao', type: 'text', required: true },
        { name: 'categoria', type: 'text', required: true },
        { name: 'unidade', type: 'text', required: true },
        { name: 'custo_unitario', type: 'number', required: false, min: 0 },
        { name: 'fornecedor', type: 'text', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_componentes_codigo ON componentes (codigo)',
        'CREATE INDEX idx_componentes_categoria ON componentes (categoria)',
        'CREATE INDEX idx_componentes_fornecedor ON componentes (fornecedor)',
      ],
    })
    app.save(componentes)

    // 2. Coleção: parametros (financeiros: margem alvo, overhead, etc)
    const parametros = new Collection({
      name: 'parametros',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'chave', type: 'text', required: true },
        { name: 'nome', type: 'text', required: true },
        { name: 'valor_percentual', type: 'number', required: false, min: 0 },
        { name: 'descricao', type: 'text' },
        { name: 'ordem', type: 'number', min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_parametros_chave ON parametros (chave)'],
    })
    app.save(parametros)

    // 3. Coleção: boms
    const boms = new Collection({
      name: 'boms',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'sku', type: 'text', required: true },
        { name: 'nome', type: 'text', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'categoria', type: 'text' },
        { name: 'overhead_percentual', type: 'number', min: 0 },
        { name: 'margem_percentual', type: 'number', min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_boms_sku ON boms (sku)'],
    })
    app.save(boms)

    // 4. Coleção: bom_items
    const bomsCollection = app.findCollectionByNameOrId('boms')
    const componentesCollection = app.findCollectionByNameOrId('componentes')

    const bomItems = new Collection({
      name: 'bom_items',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'bom_id',
          type: 'relation',
          required: true,
          collectionId: bomsCollection.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'componente_id',
          type: 'relation',
          required: false,
          collectionId: componentesCollection.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'nivel', type: 'number', required: true, min: 1 },
        { name: 'ordem', type: 'number', required: false, min: 0 },
        { name: 'codigo', type: 'text', required: true },
        { name: 'descricao', type: 'text', required: true },
        { name: 'categoria', type: 'text' },
        { name: 'unidade', type: 'text', required: true },
        { name: 'quantidade', type: 'number', required: false, min: 0 },
        { name: 'custo_unitario', type: 'number', required: false, min: 0 },
        { name: 'fornecedor', type: 'text' },
        { name: 'tipo_linha', type: 'text' }, // "componente" ou "submontagem"
        { name: 'parent_item_id', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_bom_items_bom ON bom_items (bom_id)',
        'CREATE INDEX idx_bom_items_codigo ON bom_items (codigo)',
      ],
    })
    app.save(bomItems)
  },
  (app) => {
    try {
      const bomItems = app.findCollectionByNameOrId('bom_items')
      app.delete(bomItems)
    } catch (_) {}
    try {
      const boms = app.findCollectionByNameOrId('boms')
      app.delete(boms)
    } catch (_) {}
    try {
      const parametros = app.findCollectionByNameOrId('parametros')
      app.delete(parametros)
    } catch (_) {}
    try {
      const componentes = app.findCollectionByNameOrId('componentes')
      app.delete(componentes)
    } catch (_) {}
  },
)
