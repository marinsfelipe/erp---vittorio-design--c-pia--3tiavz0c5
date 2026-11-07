// 0004 — Estrutura hierárquica multi-nível do BOM (Etapa 1)
// - Adiciona campo "tipo" (select) à collection componentes
// - Adiciona campos "item_tipo" (select) e "parent_id" (relation auto-referenciada) a bom_items
// - Backfill idempotente: componentes existentes viram componente_terceiros;
//   cada BOM recebe um item raiz tipo produto_final; itens existentes são
//   classificados (submontagem -> componente_interno, demais -> componente_terceiros)
//   e ligados ao pai correspondente preservando a hierarquia nível/ordem.
migrate(
  (app) => {
    const valores = [
      'produto_final',
      'produto_semi_acabado',
      'componente_interno',
      'componente_terceiros',
    ]

    // 1. Collection componentes: campo tipo
    const compCol = app.findCollectionByNameOrId('componentes')
    if (!compCol.fields.getByName('tipo')) {
      compCol.fields.add(
        new SelectField({ name: 'tipo', values: valores, maxSelect: 1, required: false }),
      )
    }
    app.save(compCol)

    // 2. Collection bom_items: item_tipo + parent_id (self-relation)
    const itemsCol = app.findCollectionByNameOrId('bom_items')
    if (!itemsCol.fields.getByName('item_tipo')) {
      itemsCol.fields.add(
        new SelectField({ name: 'item_tipo', values: valores, maxSelect: 1, required: false }),
      )
    }
    if (!itemsCol.fields.getByName('parent_id')) {
      itemsCol.fields.add(
        new RelationField({
          name: 'parent_id',
          collectionId: itemsCol.id,
          cascadeDelete: true,
          maxSelect: 1,
          required: false,
        }),
      )
    }
    app.save(itemsCol)

    // 3. Backfill de componentes: tudo que existe hoje é peça comprada
    const comps = app.findRecordsByFilter('componentes', '', '', 100000, 0)
    for (const c of comps) {
      if (!c.getString('tipo')) {
        c.set('tipo', 'componente_terceiros')
        app.save(c)
      }
    }

    // 4. Backfill de bom_items: raiz produto_final + classificação + parent_id
    const boms = app.findRecordsByFilter('boms', '', 'sku', 100000, 0)
    for (const bom of boms) {
      const items = app.findRecordsByFilter(
        'bom_items',
        `bom_id = '${bom.id}'`,
        'ordem,created',
        100000,
        0,
      )
      if (items.length === 0) continue

      // 4a. Garantir item raiz produto_final
      let root = null
      for (const it of items) {
        if (it.getString('item_tipo') === 'produto_final') root = it
      }
      if (!root) {
        root = new Record(itemsCol)
        root.set('bom_id', bom.id)
        root.set('nivel', 1)
        root.set('ordem', 0)
        root.set('codigo', bom.getString('sku'))
        root.set('descricao', bom.getString('nome'))
        root.set('categoria', bom.getString('categoria') || 'Produto Final')
        root.set('unidade', 'UN')
        root.set('quantidade', 1)
        root.set('custo_unitario', 0)
        root.set('fornecedor', 'Produção Interna')
        root.set('tipo_linha', 'submontagem')
        root.set('item_tipo', 'produto_final')
        app.save(root)
      }

      // 4b. Classificar cada item e definir o pai pela hierarquia nível/ordem
      const lastByNivel = { 0: root }
      for (const it of items) {
        if (root && it.id === root.id) continue

        const nivel = it.getInt('nivel') || 1
        if (!it.getString('item_tipo')) {
          const ehSubmontagem = it.getString('tipo_linha') === 'submontagem'
          it.set('item_tipo', ehSubmontagem ? 'componente_interno' : 'componente_terceiros')
        }

        let parent = lastByNivel[nivel - 1] || null
        while (parent && parent.getString('item_tipo') === 'componente_terceiros') {
          parent = lastByNivel[(parent.getInt('nivel') || 0) - 1] || null
        }
        if (!parent) parent = root

        it.set('parent_id', parent.id)
        app.save(it)
        lastByNivel[nivel] = it
        for (const k of Object.keys(lastByNivel)) {
          if (Number(k) > nivel) delete lastByNivel[k]
        }
      }
    }
  },
  (app) => {
    // down: reverter backfill não é possível sem perder dados; remove apenas campos
    try {
      const compCol = app.findCollectionByNameOrId('componentes')
      const f = compCol.fields.getByName('tipo')
      if (f) compCol.fields.removeByName('tipo')
      app.save(compCol)
    } catch (_) {}
    try {
      const itemsCol = app.findCollectionByNameOrId('bom_items')
      const f1 = itemsCol.fields.getByName('item_tipo')
      if (f1) itemsCol.fields.removeByName('item_tipo')
      const f2 = itemsCol.fields.getByName('parent_id')
      if (f2) itemsCol.fields.removeByName('parent_id')
      app.save(itemsCol)
    } catch (_) {}
  },
)
