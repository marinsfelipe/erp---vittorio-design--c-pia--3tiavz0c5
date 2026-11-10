/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook seguro para redefinição de senha por administrador.
 * Rota: POST /backend/v1/custom/admin/redefinir-senha
 *
 * Requisitos:
 * 1. O chamador DEVE ser um usuário autenticado com perfil 'admin' e status 'aprovado'
 *    na coleção 'usuarios_perfil' (ou superuser).
 * 2. Valida payload: suporta { targetUserId, novaSenha } E { userId, password }. Mínimo 8 caracteres.
 * 3. Altera a senha do usuário alvo diretamente no banco usando $app.save(record),
 *    sem exigir a senha antiga (oldPassword).
 * 4. Não-admins e chamadores sem autenticação válida recebem erro de não autorizado (401/403).
 */

routerAdd('POST', '/backend/v1/custom/admin/redefinir-senha', (e) => {
  try {
    // 1. Resolver o registro do usuário autenticado chamador
    let callerUser = e.auth

    // Se e.auth não veio preenchido pelo middleware global, inspecionar o header Authorization
    if (!callerUser) {
      let authHeader = ''
      try {
        if (e.request && e.request.header && typeof e.request.header.get === 'function') {
          authHeader = e.request.header.get('Authorization') || ''
        }
      } catch (_hdrErr) {
        // fallback
      }

      if (!authHeader) {
        try {
          const info = e.requestInfo()
          if (info && info.headers) {
            authHeader = info.headers['authorization'] || ''
          }
          if (!callerUser && info && info.auth) {
            callerUser = info.auth
          }
        } catch (_infoErr) {
          // fallback
        }
      }

      if (!callerUser && authHeader) {
        const token = authHeader.replace(/^[Bb]earer\s+/, '').trim()
        if (token) {
          try {
            callerUser = $app.findAuthRecordByToken(token, 'auth')
          } catch (_tokenErr) {
            // token inválido ou expirado
          }
        }
      }
    }

    if (!callerUser) {
      return e.json(401, {
        code: 401,
        message: 'Acesso não autorizado. É necessário estar autenticado.',
      })
    }

    const callerId =
      callerUser.id || (typeof callerUser.get === 'function' ? callerUser.get('id') : '')
    const isSuperuser =
      typeof callerUser.isSuperuser === 'function' ? callerUser.isSuperuser() : false

    // 2. Se for superuser, tem permissão imediata. Senão, verificar usuarios_perfil
    if (!isSuperuser) {
      let perfilRecord = null

      // Tentativa 1: findFirstRecordByFilter por user
      try {
        perfilRecord = $app.findFirstRecordByFilter(
          'usuarios_perfil',
          "user = '" + callerId.replace(/'/g, "\\'") + "'",
        )
      } catch (_err1) {
        perfilRecord = null
      }

      // Tentativa 2: findFirstRecordByFilter por email
      if (!perfilRecord) {
        try {
          const callerEmail =
            callerUser.email ||
            (typeof callerUser.get === 'function' ? callerUser.get('email') : '')
          if (callerEmail) {
            perfilRecord = $app.findFirstRecordByFilter(
              'usuarios_perfil',
              "email = '" + callerEmail.replace(/'/g, "\\'") + "'",
            )
          }
        } catch (_err2) {
          perfilRecord = null
        }
      }

      // Tentativa 3: findRecordsByFilter com escape
      if (!perfilRecord) {
        try {
          const records = $app.findRecordsByFilter(
            'usuarios_perfil',
            'user = {:userId}',
            '-created',
            1,
            0,
            { userId: callerId },
          )
          if (records && records.length > 0) {
            perfilRecord = records[0]
          }
        } catch (_err3) {
          // segue
        }
      }

      if (!perfilRecord) {
        return e.json(403, {
          code: 403,
          message: 'Acesso negado. Perfil de usuário não encontrado.',
        })
      }

      const perfil =
        (typeof perfilRecord.get === 'function'
          ? perfilRecord.get('perfil')
          : perfilRecord.perfil) || ''
      const status =
        (typeof perfilRecord.get === 'function'
          ? perfilRecord.get('status')
          : perfilRecord.status) || ''

      if (perfil !== 'admin' || status !== 'aprovado') {
        return e.json(403, {
          code: 403,
          message: 'Acesso negado. Apenas administradores aprovados podem redefinir senhas.',
        })
      }
    }

    // 3. Ler e validar o payload da requisição
    let body = {}
    try {
      const rawBody = typeof e.request.body === 'string' ? e.request.body : toString(e.request.body)
      if (rawBody) {
        body = JSON.parse(rawBody)
      }
    } catch (_parseErr) {
      try {
        const info = e.requestInfo()
        if (info && info.body) {
          body = info.body
        }
      } catch (_bErr) {
        body = {}
      }
    }

    // Suporta ambos os nomes de campos: targetUserId/userId e novaSenha/password
    const targetUserId = (body.targetUserId || body.userId || '').trim()
    const novaSenha = (body.novaSenha || body.password || '').trim()

    if (!targetUserId) {
      return e.json(400, {
        code: 400,
        message: 'O campo targetUserId (ou userId) é obrigatório.',
      })
    }

    if (!novaSenha || novaSenha.length < 8) {
      return e.json(400, {
        code: 400,
        message: 'A nova senha deve ter no mínimo 8 caracteres.',
      })
    }

    // 4. Localizar o usuário alvo na coleção 'users'
    let targetUser = null
    try {
      targetUser = $app.findRecordById('users', targetUserId)
    } catch (_errFind) {
      return e.json(404, {
        code: 404,
        message: 'Usuário alvo não encontrado.',
      })
    }

    // 5. Definir a nova senha e salvar no banco via $app.save (sem validar oldPassword)
    targetUser.setPassword(novaSenha)
    $app.save(targetUser)

    return e.json(200, {
      success: true,
      message: 'Senha redefinida com sucesso.',
      userId: targetUserId,
    })
  } catch (err) {
    const errorMsg = err && err.message ? err.message : String(err)
    return e.json(500, {
      code: 500,
      message: 'Erro interno ao redefinir senha: ' + errorMsg,
    })
  }
})
