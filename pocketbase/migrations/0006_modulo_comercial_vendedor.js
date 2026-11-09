migrate(
  (app) => {
    // ===== FUNCIONALIDADE 1 — Módulo Comercial: perfil Vendedor =====
    // 1) Novo valor 'vendedor' nos enums de perfil (users e usuarios_perfil)
    // 2) Campo criador nas propostas
    // 3) Coleção clientes com RLS (vendedor vê/edita só os seus; admin vê todos)

    // ----- 1. users.perfil: adiciona 'vendedor' -----
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const perfilField = users.fields.getByName('perfil')
    if (perfilField && !perfilField.values.includes('vendedor')) {
      perfilField.values.push('vendedor')
      app.save(users)
    }

    // ----- 2. usuarios_perfil.perfil: adiciona 'vendedor' e permite autoedição de perfil -----
    const up = app.findCollectionByNameOrId('usuarios_perfil')
    const upPerfil = up.fields.getByName('perfil')
    if (upPerfil && !upPerfil.values.includes('vendedor')) {
      upPerfil.values.push('vendedor')
    }
    // O admin gerencia o perfil pela página Usuários (escrita continua restrita a admin);
    // usuário comum e vendedor leem o próprio registro para o AuthContext saber o perfil.
    up.listRule =
      "@request.auth.id != '' && (user = @request.auth.id || @request.auth.perfil = 'admin')"
    up.viewRule =
      "@request.auth.id != '' && (user = @request.auth.id || @request.auth.perfil = 'admin')"
    up.createRule =
      "@request.auth.id != '' && (user = @request.auth.id || @request.auth.perfil = 'admin')"
    up.updateRule = "@request.auth.id != '' && @request.auth.perfil = 'admin'"
    up.deleteRule = "@request.auth.id != '' && @request.auth.perfil = 'admin'"
    app.save(up)

    // ----- 3. propostas: campo criador + regras por perfil -----
    const propostas = app.findCollectionByNameOrId('propostas')
    if (!propostas.fields.getByName('criador')) {
      propostas.fields.add(
        new RelationField({
          name: 'criador',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          required: false,
          maxSelect: 1,
        }),
      )
    }
    propostas.addIndex('idx_propostas_criador', false, 'criador', '')
    // Regras:
    // - admin vê/edita tudo; vendedor e usuário comum veem apenas o que criaram
    //   (o usuário comum mantém o acesso atual: hoje ele já via todas — passa a ver
    //   apenas as que criar, o que não altera sua tela, pois ele também só cria as suas)
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

    // Backfill idempotente: propostas existentes ficam com criador do primeiro admin aprovado
    // (nenhuma proposta tem criador ainda; se houver, preserva). Deixa criador vazio para
    // não esconder propostas antigas de ninguém — regra acima já cobre criador = ''.

    // ----- 4. proposta_items: acompanha a visibilidade da proposta-mãe -----
    const itens = app.findCollectionByNameOrId('proposta_items')
    // O item é visível quando sua proposta-mãe atende à mesma regra de leitura
    itens.listRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || proposta_id.criador = @request.auth.id || proposta_id.criador = '')"
    itens.viewRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || proposta_id.criador = @request.auth.id || proposta_id.criador = '')"
    itens.createRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || proposta_id.criador = @request.auth.id || proposta_id.criador = '')"
    itens.updateRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || proposta_id.criador = @request.auth.id || proposta_id.criador = '')"
    itens.deleteRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || proposta_id.criador = @request.auth.id || proposta_id.criador = '')"
    app.save(itens)

    // ----- 5. RLS por perfil: vendedor não lê custos, margens, parâmetros, BOMs nem compras -----
    // Regra admin-only para as coleções que expõem custo/estrutura/compras.
    // admin: acesso total; vendedor e usuário comum: sem acesso via API.
    // O usuário comum acessa essas telas pelo front, que usa a sessão admin? — NÃO:
    // o requisito diz apenas que o VENDEDOR não pode ler. O usuário comum mantém acesso,
    // então essas coleções permitem qualquer usuário autenticado EXCETO o vendedor.
    const regraSemVendedor = "@request.auth.id != '' && @request.auth.perfil != 'vendedor'"

    const colecoesRestritas = [
      'componentes',
      'parametros',
      'boms',
      'bom_items',
      'ordens_compra',
      'ordem_compra_itens',
    ]
    for (const nome of colecoesRestritas) {
      let col
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (_) {
        continue // coleção ainda não existe nesta cópia — nada a fazer
      }
      col.listRule = regraSemVendedor
      col.viewRule = regraSemVendedor
      col.createRule = regraSemVendedor
      col.updateRule = regraSemVendedor
      col.deleteRule = regraSemVendedor
      app.save(col)
    }

    // ----- 6. Coleção clientes =====
    let clientes
    try {
      clientes = app.findCollectionByNameOrId('clientes')
    } catch (_) {
      clientes = new Collection({
        name: 'clientes',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || @request.auth.perfil = 'vendedor' && criador = @request.auth.id)",
        viewRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || @request.auth.perfil = 'vendedor' && criador = @request.auth.id)",
        createRule:
          "@request.auth.id != '' && @request.auth.perfil = 'vendedor' && criador = @request.body.criador",
        updateRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || @request.auth.perfil = 'vendedor' && criador = @request.auth.id)",
        deleteRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || @request.auth.perfil = 'vendedor' && criador = @request.auth.id)",
        fields: [
          { name: 'razao_social', type: 'text', required: true, max: 200 },
          { name: 'cnpj', type: 'text', max: 32 },
          { name: 'endereco', type: 'text', max: 255 },
          { name: 'cidade', type: 'text', max: 120 },
          { name: 'uf', type: 'text', max: 2 },
          { name: 'contato', type: 'text', max: 120 },
          { name: 'email', type: 'email' },
          { name: 'telefone', type: 'text', max: 32 },
          {
            name: 'criador',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_clientes_criador ON clientes (criador)',
          'CREATE INDEX idx_clientes_razao ON clientes (razao_social)',
        ],
      })
      app.save(clientes)
    }
  },
  (app) => {
    // Reverte: remove coleção clientes
    try {
      const clientes = app.findCollectionByNameOrId('clientes')
      app.delete(clientes)
    } catch (_) {}

    // Remove campo criador das propostas
    try {
      const propostas = app.findCollectionByNameOrId('propostas')
      propostas.removeIndex('idx_propostas_criador')
      const f = propostas.fields.getByName('criador')
      if (f) propostas.fields.removeByName('criador')
      app.save(propostas)
    } catch (_) {}

    // Restaura regras anteriores
    const regraAuth = "@request.auth.id != ''"
    for (const nome of [
      'componentes',
      'parametros',
      'boms',
      'bom_items',
      'ordens_compra',
      'ordem_compra_itens',
    ]) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        col.listRule = regraAuth
        col.viewRule = regraAuth
        col.createRule = regraAuth
        col.updateRule = regraAuth
        col.deleteRule = regraAuth
        app.save(col)
      } catch (_) {}
    }
    try {
      const up = app.findCollectionByNameOrId('usuarios_perfil')
      // mantém o valor 'vendedor' no enum (inofensivo) e as regras anteriores
      app.save(up)
    } catch (_) {}
  },
)
