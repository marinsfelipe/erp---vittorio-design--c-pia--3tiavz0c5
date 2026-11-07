migrate(
  (app) => {
    // ===== 1. Coleção usuarios_perfil =====
    // Tabela auxiliar com perfil e status do usuário.
    // Regras:
    // - Admin tem acesso total (list, view, create, update, delete).
    // - Usuário comum lê/visualiza apenas o próprio registro (user = @request.auth.id).
    // - Usuário autenticado pode criar o próprio registro apenas com perfil = 'usuario' e status = 'pendente'.
    // - Usuário comum não pode alterar status ou perfil (apenas admin).
    let col
    try {
      col = app.findCollectionByNameOrId('usuarios_perfil')
    } catch (_) {
      col = new Collection({
        name: 'usuarios_perfil',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (user = @request.auth.id || @request.auth.perfil = 'admin')",
        viewRule:
          "@request.auth.id != '' && (user = @request.auth.id || @request.auth.perfil = 'admin')",
        createRule:
          "@request.auth.id != '' && (user = @request.auth.id || @request.auth.perfil = 'admin')",
        updateRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'nome', type: 'text', required: true, max: 200 },
          { name: 'email', type: 'email' },
          {
            name: 'perfil',
            type: 'select',
            required: true,
            values: ['admin', 'usuario'],
            maxSelect: 1,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['pendente', 'aprovado', 'bloqueado'],
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_usuarios_perfil_user ON usuarios_perfil (user)'],
      })
      app.save(col)
    }

    // ===== 2. Campos perfil/status na coleção users (Auth) =====
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('perfil')) {
      users.fields.add(
        new SelectField({
          name: 'perfil',
          values: ['admin', 'usuario'],
          maxSelect: 1,
        }),
      )
    }
    if (!users.fields.getByName('status')) {
      users.fields.add(
        new SelectField({
          name: 'status',
          values: ['pendente', 'aprovado', 'bloqueado'],
          maxSelect: 1,
        }),
      )
    }
    // Bloqueia auto-atribuição de perfil na autoedição:
    // admin pode atualizar qualquer campo; usuário comum pode editar a si mesmo
    // apenas sem alterar perfil ou status (:changed = false)
    users.listRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.perfil = 'admin')"
    users.viewRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.perfil = 'admin')"
    users.createRule = '' // Cadastro público permitido
    users.updateRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || (id = @request.auth.id && @request.body.perfil:changed = false && @request.body.status:changed = false))"
    users.deleteRule = "@request.auth.id != '' && @request.auth.perfil = 'admin'"
    app.save(users)

    // ===== 3. Seed idempotente: primeiro usuário vira admin aprovado =====
    const allUsers = app.findRecordsByFilter('users', '', 'created', 500, 0)
    let firstUser = null
    for (const u of allUsers) {
      if (!firstUser) firstUser = u
      const uProfile = u.getString('perfil')
      const uStatus = u.getString('status')
      // Se for o primeiro usuário ou já tiver perfil admin, garante admin/aprovado
      if (u.id === firstUser.id || uProfile === 'admin') {
        u.set('perfil', 'admin')
        u.set('status', 'aprovado')
        app.save(u)
      } else if (!uStatus) {
        u.set('perfil', uProfile || 'usuario')
        u.set('status', 'aprovado')
        app.save(u)
      }
    }

    // Garante que cada usuário existente tenha um registro em usuarios_perfil
    for (const u of allUsers) {
      try {
        app.findFirstRecordByData('usuarios_perfil', 'user', u.id)
      } catch (_) {
        const rec = new Record(col)
        rec.set('user', u.id)
        rec.set('nome', u.getString('name') || u.getString('email') || 'Usuário')
        rec.set('email', u.getString('email'))
        rec.set('perfil', u.getString('perfil') || 'usuario')
        rec.set('status', u.getString('status') || 'aprovado')
        app.save(rec)
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('usuarios_perfil')
      app.delete(col)
    } catch (_) {}
  },
)
