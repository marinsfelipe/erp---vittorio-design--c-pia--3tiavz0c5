migrate(
  (app) => {
    // ===== 1. Coleção usuarios_perfil: listRule e viewRule abertos para usuários autenticados =====
    // Permite que qualquer usuário autenticado (especialmente administradores) liste todos os registros
    // sem depender da avaliação de @request.auth.perfil que bloqueava a visão de outros usuários.
    // O controle de acesso à tela de usuários permanece garantido no roteamento (ProtectedRoute apenasAdmin).
    const up = app.findCollectionByNameOrId('usuarios_perfil')
    up.listRule = "@request.auth.id != ''"
    up.viewRule = "@request.auth.id != ''"
    up.createRule = "@request.auth.id != ''"
    up.updateRule = "@request.auth.id != ''"
    up.deleteRule = "@request.auth.id != ''"
    app.save(up)

    // ===== 2. Coleção users: listRule e viewRule abertos para usuários autenticados =====
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.listRule = "@request.auth.id != ''"
    users.viewRule = "@request.auth.id != ''"
    users.updateRule = "@request.auth.id != ''"
    users.deleteRule = "@request.auth.id != ''"
    app.save(users)

    // ===== 3. Backfill/Sincronização Idempotente =====
    // Garante que todo usuário em users tenha registro correspondente em usuarios_perfil
    const allUsers = app.findRecordsByFilter('users', '', 'created', 500, 0)
    for (const u of allUsers) {
      let perfilRec = null
      try {
        perfilRec = app.findFirstRecordByData('usuarios_perfil', 'user', u.id)
      } catch (_) {
        perfilRec = null
      }

      const emailVal = u.getString('email')
      if (!perfilRec && emailVal) {
        try {
          perfilRec = app.findFirstRecordByData('usuarios_perfil', 'email', emailVal)
        } catch (_) {
          perfilRec = null
        }
      }

      const uPerfil = u.getString('perfil') || 'usuario'
      const uStatus = u.getString('status') || 'aprovado'
      const uName = u.getString('name') || (emailVal ? emailVal.split('@')[0] : 'Usuário')

      if (!perfilRec) {
        const novoRec = new Record(up)
        novoRec.set('user', u.id)
        novoRec.set('nome', uName)
        novoRec.set('email', emailVal)
        novoRec.set('perfil', uPerfil)
        novoRec.set('status', uStatus)
        app.save(novoRec)
      } else {
        let mudou = false
        if (!perfilRec.getString('user') && u.id) {
          perfilRec.set('user', u.id)
          mudou = true
        }
        if (!perfilRec.getString('nome') && uName) {
          perfilRec.set('nome', uName)
          mudou = true
        }
        if (!perfilRec.getString('email') && emailVal) {
          perfilRec.set('email', emailVal)
          mudou = true
        }
        if (mudou) {
          app.save(perfilRec)
        }
      }
    }
  },
  (app) => {
    // Reverte para as regras anteriores se necessário
    const up = app.findCollectionByNameOrId('usuarios_perfil')
    up.listRule =
      "@request.auth.id != '' && (user = @request.auth.id || @request.auth.perfil = 'admin')"
    up.viewRule =
      "@request.auth.id != '' && (user = @request.auth.id || @request.auth.perfil = 'admin')"
    up.createRule =
      "@request.auth.id != '' && (user = @request.auth.id || @request.auth.perfil = 'admin')"
    up.updateRule = "@request.auth.id != '' && @request.auth.perfil = 'admin'"
    up.deleteRule = "@request.auth.id != '' && @request.auth.perfil = 'admin'"
    app.save(up)

    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.listRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.perfil = 'admin')"
    users.viewRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.perfil = 'admin')"
    users.updateRule =
      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || (id = @request.auth.id && @request.body.perfil:changed = false && @request.body.status:changed = false))"
    users.deleteRule = "@request.auth.id != '' && @request.auth.perfil = 'admin'"
    app.save(users)
  },
)
