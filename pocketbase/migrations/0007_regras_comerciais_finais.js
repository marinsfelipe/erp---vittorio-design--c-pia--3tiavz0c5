migrate(
  (app) => {
    // ===== FUNCIONALIDADE 1 — ajustes finais das regras de acesso =====

    // ----- propostas: admin vê todas; usuário comum mantém visão atual (todas);
    // vendedor vê somente as propostas que ele mesmo criou -----
    const regraPropostas =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || @request.auth.perfil != 'vendedor' || criador = @request.auth.id)"

    const propostas = app.findCollectionByNameOrId('propostas')
    propostas.listRule = regraPropostas
    propostas.viewRule = regraPropostas
    // Na criação, o criador precisa ser o próprio usuário (admin pode qualquer coisa)
    propostas.createRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.body.criador)"
    propostas.updateRule = regraPropostas
    propostas.deleteRule = regraPropostas
    app.save(propostas)

    // ----- proposta_items: acompanha a proposta-mãe (vendedor só dos seus) -----
    const regraItens =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || @request.auth.perfil != 'vendedor' || proposta_id.criador = @request.auth.id)"
    const itens = app.findCollectionByNameOrId('proposta_items')
    itens.listRule = regraItens
    itens.viewRule = regraItens
    app.save(itens)

    // ----- clientes: admin também pode cadastrar -----
    const clientes = app.findCollectionByNameOrId('clientes')
    clientes.createRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || @request.auth.perfil = 'vendedor' && criador = @request.body.criador)"
    app.save(clientes)
  },
  (app) => {
    // Reverte para as regras da migração 0006
    const propostas = app.findCollectionByNameOrId('propostas')
    propostas.listRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id || criador = '')"
    propostas.viewRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id || criador = '')"
    propostas.createRule = "@request.auth.id != ''"
    propostas.updateRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id || criador = '')"
    propostas.deleteRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id || criador = '')"
    app.save(propostas)

    const itens = app.findCollectionByNameOrId('proposta_items')
    itens.listRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || proposta_id.criador = @request.auth.id || proposta_id.criador = '')"
    itens.viewRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || proposta_id.criador = @request.auth.id || proposta_id.criador = '')"
    app.save(itens)

    const clientes = app.findCollectionByNameOrId('clientes')
    clientes.createRule =
      "@request.auth.id != '' && @request.auth.perfil = 'vendedor' && criador = @request.body.criador"
    app.save(clientes)
  },
)
