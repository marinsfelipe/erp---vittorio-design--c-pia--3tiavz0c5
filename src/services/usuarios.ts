import pb from '@/lib/pocketbase/client'
import type { UsuarioPerfil } from '@/types/erp'

export const usuariosService = {
  /**
   * Retorna a lista completa de usuários cadastrados no ERP.
   * Lê primariamente de usuarios_perfil e, de forma resiliente, faz reconciliação
   * com a coleção users do Auth, garantindo que NENHUM usuário criado fique invisível.
   */
  async getAll(): Promise<UsuarioPerfil[]> {
    let perfis: UsuarioPerfil[] = []
    try {
      perfis = await pb.collection('usuarios_perfil').getFullList<UsuarioPerfil>({
        sort: '-created',
      })
    } catch (errPerfil) {
      console.warn('usuariosService.getAll: Falha ao listar usuarios_perfil:', errPerfil)
      perfis = []
    }

    // Tenta reconciliar com a coleção users para resiliência total
    try {
      const authUsers = await pb.collection('users').getFullList({
        sort: '-created',
      })

      // Mapeia perfis existentes por ID de user e por email
      const perfilByUser = new Map<string, UsuarioPerfil>()
      const perfilByEmail = new Map<string, UsuarioPerfil>()
      for (const p of perfis) {
        if (p.user) perfilByUser.set(p.user, p)
        if (p.email) perfilByEmail.set(p.email.toLowerCase(), p)
      }

      // Para cada usuário do Auth, verifica se já existe na lista
      for (const u of authUsers) {
        const uEmail = (u.email || '').toLowerCase()
        const existing = perfilByUser.get(u.id) || (uEmail ? perfilByEmail.get(uEmail) : undefined)

        if (!existing) {
          // Cria objeto sintético na memória para exibição imediata
          const fallback: UsuarioPerfil = {
            id: u.id,
            user: u.id,
            nome: (u.name as string) || (uEmail ? uEmail.split('@')[0] : 'Usuário'),
            email: uEmail,
            perfil: (u.perfil as any) || 'usuario',
            status: (u.status as any) || 'aprovado',
            created: u.created || new Date().toISOString(),
            updated: u.updated || new Date().toISOString(),
          }
          perfis.push(fallback)

          // Em segundo plano, tenta persistir o registro em usuarios_perfil caso falte
          pb.collection('usuarios_perfil')
            .create({
              user: u.id,
              nome: fallback.nome,
              email: fallback.email,
              perfil: fallback.perfil,
              status: fallback.status,
            })
            .catch(() => {
              // Silencioso se já existir ou restrição
            })
        } else {
          // Garante que o campo 'user' esteja apontando para o id correto do Auth se faltar
          if (!existing.user && u.id) {
            existing.user = u.id
          }
          if (!existing.email && uEmail) {
            existing.email = uEmail
          }
          if (!existing.nome && u.name) {
            existing.nome = u.name as string
          }
        }
      }
    } catch (errUsers) {
      // Se não conseguir ler users (ex: permissão do token), continua com a lista de perfis
      console.warn('usuariosService.getAll: Falha ao complementar com users:', errUsers)
    }

    // Ordena os usuários por data decrescente
    return perfis.sort((a, b) => {
      const tA = a.created ? new Date(a.created).getTime() : 0
      const tB = b.created ? new Date(b.created).getTime() : 0
      return tB - tA
    })
  },

  async getMeu(): Promise<UsuarioPerfil | null> {
    try {
      const rec = await pb
        .collection('usuarios_perfil')
        .getFirstListItem<UsuarioPerfil>(`user = "${pb.authStore.record?.id}"`)
      return rec
    } catch {
      return null
    }
  },

  async update(id: string, data: Partial<UsuarioPerfil>): Promise<UsuarioPerfil> {
    return await pb.collection('usuarios_perfil').update<UsuarioPerfil>(id, data)
  },

  async delete(id: string, userId?: string): Promise<boolean> {
    // 1. Exclui o registro da tabela usuarios_perfil se existir
    try {
      await pb.collection('usuarios_perfil').delete(id)
    } catch (errPerfil) {
      console.warn('Erro ao deletar em usuarios_perfil:', errPerfil)
    }

    // 2. Se o ID do usuário de autenticação foi fornecido, exclui também do Auth
    const targetAuthId = userId || id
    if (targetAuthId) {
      try {
        await pb.collection('users').delete(targetAuthId)
      } catch (err) {
        console.warn('Erro ao excluir usuário do Auth:', err)
      }
    }
    return true
  },

  async setStatus(
    perfilId: string,
    userId: string,
    status: 'pendente' | 'aprovado' | 'bloqueado',
  ): Promise<void> {
    try {
      await pb.collection('usuarios_perfil').update(perfilId, { status })
    } catch (errPerfil) {
      console.warn('Erro ao atualizar status em usuarios_perfil:', errPerfil)
    }
    const targetUserId = userId || perfilId
    if (targetUserId) {
      try {
        await pb.collection('users').update(targetUserId, { status })
      } catch (err) {
        console.warn('Erro ao sincronizar status no users:', err)
      }
    }
  },

  async setPerfil(
    perfilId: string,
    userId: string,
    perfil: 'admin' | 'usuario' | 'vendedor',
  ): Promise<void> {
    try {
      await pb.collection('usuarios_perfil').update(perfilId, { perfil })
    } catch (errPerfil) {
      console.warn('Erro ao atualizar perfil em usuarios_perfil:', errPerfil)
    }
    const targetUserId = userId || perfilId
    if (targetUserId) {
      try {
        await pb.collection('users').update(targetUserId, { perfil })
      } catch (err) {
        console.warn('Erro ao sincronizar perfil no users:', err)
      }
    }
  },

  async redefinirSenhaAdmin(userId: string, novaSenhaTemporaria: string): Promise<void> {
    if (!userId || !userId.trim()) throw new Error('ID do usuário não fornecido.')
    const senhaTrim = (novaSenhaTemporaria || '').trim()
    if (senhaTrim.length < 8) {
      throw new Error('A nova senha deve conter no mínimo 8 caracteres.')
    }

    const rawToken = pb.authStore.token
    if (!rawToken) {
      throw new Error('Você precisa estar autenticado como administrador para redefinir senhas.')
    }

    const cleanToken = rawToken.replace(/^Bearer\s+/i, '').trim()

    try {
      // Chama a rota personalizada backend/v1 com token explícito e formato compatível
      const response: any = await pb.send('/backend/v1/custom/admin/redefinir-senha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: cleanToken,
        },
        body: {
          targetUserId: userId.trim(),
          userId: userId.trim(),
          novaSenha: senhaTrim,
          password: senhaTrim,
        },
      })

      if (response && response.success === false) {
        throw new Error(response.message || 'Falha ao redefinir senha.')
      }
    } catch (err: any) {
      // Trata mensagens de erro retornadas pelo backend
      const backendMsg = err?.response?.message || err?.data?.message || err?.message || ''
      if (backendMsg) {
        throw new Error(backendMsg)
      }
      throw new Error('Não foi possível redefinir a senha do usuário.')
    }
  },

  /**
   * Criação direta de usuário pelo administrador na página Usuários.
   * O usuário já é criado com status "aprovado" (e verificado), podendo logar imediatamente
   * sem passar pela fila de aprovação.
   */
  async criarUsuarioAdmin(dados: {
    nome: string
    email: string
    senha: string
    perfil: 'admin' | 'usuario' | 'vendedor'
  }): Promise<{ user: any; perfil: UsuarioPerfil }> {
    const nomeTrim = dados.nome?.trim()
    const emailTrim = dados.email?.trim().toLowerCase()
    const senhaTrim = dados.senha || ''
    const perfil = dados.perfil || 'usuario'

    if (!nomeTrim) {
      throw new Error('O nome completo é obrigatório.')
    }
    if (!emailTrim) {
      throw new Error('O e-mail é obrigatório.')
    }
    // Validação básica de formato de e-mail
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      throw new Error('Informe um endereço de e-mail válido.')
    }
    if (!senhaTrim || senhaTrim.length < 8) {
      throw new Error('A senha inicial deve ter no mínimo 8 caracteres.')
    }

    // 1. Cria a conta no Auth do PocketBase (coleção users)
    let novoUser: any
    try {
      novoUser = await pb.collection('users').create({
        email: emailTrim,
        password: senhaTrim,
        passwordConfirm: senhaTrim,
        name: nomeTrim,
        perfil,
        status: 'aprovado',
        emailVisibility: true,
      })
    } catch (err: any) {
      const errMsg = err?.data?.data?.email?.message || err?.message || ''
      if (
        errMsg.toLowerCase().includes('unique') ||
        errMsg.toLowerCase().includes('already') ||
        errMsg.toLowerCase().includes('exists') ||
        errMsg.toLowerCase().includes('duplic')
      ) {
        throw new Error('Já existe um usuário cadastrado com este e-mail.')
      }
      throw new Error(errMsg || 'Erro ao cadastrar usuário no sistema.')
    }

    // 2. Cria o registro de perfil complementar em usuarios_perfil
    let perfilRec: UsuarioPerfil
    try {
      perfilRec = await pb.collection('usuarios_perfil').create<UsuarioPerfil>({
        user: novoUser.id,
        nome: nomeTrim,
        email: emailTrim,
        perfil,
        status: 'aprovado',
      })
    } catch (errPerfil: any) {
      console.warn('Aviso ao criar registro em usuarios_perfil:', errPerfil)
      // Tenta recuperar caso tenha sido gerado ou busca
      try {
        perfilRec = await pb
          .collection('usuarios_perfil')
          .getFirstListItem<UsuarioPerfil>(`user = "${novoUser.id}"`)
      } catch {
        perfilRec = {
          id: novoUser.id,
          user: novoUser.id,
          nome: nomeTrim,
          email: emailTrim,
          perfil,
          status: 'aprovado',
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        } as UsuarioPerfil
      }
    }

    return { user: novoUser, perfil: perfilRec }
  },
}
