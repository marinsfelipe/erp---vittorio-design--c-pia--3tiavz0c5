/**
 * Hook do PocketBase / Skip Cloud para administração de senhas de usuários.
 * Permite que um usuário autenticado com perfil 'admin' redefina a senha de qualquer usuário
 * sem precisar informar a senha antiga (oldPassword).
 */

routerAdd('POST', '/backend/v1/custom/admin/redefinir-senha', (e) => {
  // 1. Verifica autenticação via e.auth (PocketBase v0.23+)
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, {
      message: 'Não autorizado. Faça login para continuar.',
    })
  }

  // 2. Verifica se o usuário autenticado é admin
  const perfil = authRecord.getString('perfil')
  if (perfil !== 'admin') {
    return e.json(403, {
      message: 'Apenas administradores podem redefinir senhas de outros usuários.',
    })
  }

  // 3. Lê o corpo da requisição via e.requestInfo().body
  const reqInfo = e.requestInfo()
  const data = reqInfo && reqInfo.body ? reqInfo.body : {}
  const targetUserId = (data.userId || '').toString().trim()
  const novaSenha = (data.password || '').toString()

  if (!targetUserId) {
    return e.json(400, {
      message: 'ID do usuário não fornecido.',
    })
  }

  if (!novaSenha || novaSenha.length < 8) {
    return e.json(400, {
      message: 'A senha deve conter no mínimo 8 caracteres.',
    })
  }

  // 4. Localiza o usuário alvo na coleção users
  let targetUser = null
  try {
    targetUser = $app.findRecordById('users', targetUserId)
  } catch (err) {
    return e.json(404, {
      message: 'Usuário não encontrado no sistema.',
    })
  }

  // 5. Define a nova senha e salva no banco
  try {
    targetUser.setPassword(novaSenha)
    $app.save(targetUser)

    return e.json(200, {
      success: true,
      message: 'Senha redefinida com sucesso.',
      userId: targetUserId,
    })
  } catch (err) {
    const errorMsg = err && err.message ? err.message : 'Erro ao salvar nova senha.'
    return e.json(500, {
      message: 'Erro interno ao atualizar a senha: ' + errorMsg,
    })
  }
})
