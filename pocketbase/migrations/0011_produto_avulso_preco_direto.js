// 0011 — Produto avulso na proposta com preço direto (sem BOM)
// - Adiciona campos preco_direto (bool), preco_venda (number) e unidade (text) na coleção boms
// - Adiciona campos preco_direto (bool) e unidade (text) na coleção proposta_items
// - Torna bom_id opcional em proposta_items caso necessário
// - Ajusta regras de acesso em boms para que vendedores possam ler e cadastrar produtos avulsos (preco_direto = true)
migrate(
  (app) => {
    // 1. Coleção boms: adiciona preco_direto, preco_venda e unidade
    const bomsCol = app.findCollectionByNameOrId('boms')
    if (!bomsCol.fields.getByName('preco_direto')) {
      bomsCol.fields.add(
        new BoolField({
          name: 'preco_direto',
          required: false,
        }),
      )
    }
    if (!bomsCol.fields.getByName('preco_venda')) {
      bomsCol.fields.add(
        new NumberField({
          name: 'preco_venda',
          required: false,
        }),
      )
    }
    if (!bomsCol.fields.getByName('unidade')) {
      bomsCol.fields.add(
        new TextField({
          name: 'unidade',
          required: false,
        }),
      )
    }

    // Regras de boms: vendedor pode listar, ver e criar produtos de preco_direto = true,
    // mas não vê custos, margens nem BOMs industriais com estrutura multi-nível.
    // Admin e usuários normais mantêm acesso pleno.
    bomsCol.listRule =
      "@request.auth.id != '' && (@request.auth.perfil != 'vendedor' || preco_direto = true)"
    bomsCol.viewRule =
      "@request.auth.id != '' && (@request.auth.perfil != 'vendedor' || preco_direto = true)"
    bomsCol.createRule =
      "@request.auth.id != '' && (@request.auth.perfil != 'vendedor' || @request.body.preco_direto = true)"
    bomsCol.updateRule =
      "@request.auth.id != '' && (@request.auth.perfil != 'vendedor' || preco_direto = true)"

    app.save(bomsCol)

    // 2. Coleção proposta_items: adiciona preco_direto e unidade
    const itemsCol = app.findCollectionByNameOrId('proposta_items')
    if (!itemsCol.fields.getByName('preco_direto')) {
      itemsCol.fields.add(
        new BoolField({
          name: 'preco_direto',
          required: false,
        }),
      )
    }
    if (!itemsCol.fields.getByName('unidade')) {
      itemsCol.fields.add(
        new TextField({
          name: 'unidade',
          required: false,
        }),
      )
    }

    // Permitir bom_id opcional caso algum produto avulso não tenha BOM vinculado
    const bomIdField = itemsCol.fields.getByName('bom_id')
    if (bomIdField) {
      bomIdField.required = false
    }

    app.save(itemsCol)
  },
  (app) => {
    try {
      const bomsCol = app.findCollectionByNameOrId('boms')
      if (bomsCol.fields.getByName('preco_direto')) bomsCol.fields.removeByName('preco_direto')
      if (bomsCol.fields.getByName('preco_venda')) bomsCol.fields.removeByName('preco_venda')
      if (bomsCol.fields.getByName('unidade')) bomsCol.fields.removeByName('unidade')
      bomsCol.listRule = "@request.auth.id != '' && @request.auth.perfil != 'vendedor'"
      bomsCol.viewRule = "@request.auth.id != '' && @request.auth.perfil != 'vendedor'"
      bomsCol.createRule = "@request.auth.id != '' && @request.auth.perfil != 'vendedor'"
      bomsCol.updateRule = "@request.auth.id != '' && @request.auth.perfil != 'vendedor'"
      app.save(bomsCol)
    } catch (_) {}

    try {
      const itemsCol = app.findCollectionByNameOrId('proposta_items')
      if (itemsCol.fields.getByName('preco_direto')) itemsCol.fields.removeByName('preco_direto')
      if (itemsCol.fields.getByName('unidade')) itemsCol.fields.removeByName('unidade')
      app.save(itemsCol)
    } catch (_) {}
  },
)
