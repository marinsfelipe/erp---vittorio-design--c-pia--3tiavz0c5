migrate(
  (app) => {
    // Atualizar regras da coleção categorias_produto para garantir que:
    // list / view: acessível por qualquer usuário autenticado (admin, vendedor, usuario)
    // create / update / delete: apenas administradores aprovados
    const col = app.findCollectionByNameOrId('categorias_produto')
    col.listRule = "@request.auth.id != ''"
    col.viewRule = "@request.auth.id != ''"
    col.createRule = "@request.auth.id != '' && @request.auth.perfil = 'admin'"
    col.updateRule = "@request.auth.id != '' && @request.auth.perfil = 'admin'"
    col.deleteRule = "@request.auth.id != '' && @request.auth.perfil = 'admin'"
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('categorias_produto')
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      app.save(col)
    } catch (_) {}
  },
)
