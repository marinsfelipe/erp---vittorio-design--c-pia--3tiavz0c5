import pb from '@/lib/pocketbase/client'
import type { UsuarioPerfil } from '@/types/erp'

export const usuariosService = {
  async getAll(): Promise<UsuarioPerfil[]> {
    return await pb.collection('usuarios_perfil').getFullList<UsuarioPerfil>({
      sort: '-created',
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
    // Exclui o registro da tabela usuarios_perfil
    await pb.collection('usuarios_perfil').delete(id)
    // Se o ID do usuário de autenticação foi fornecido, exclui também do Auth
    if (userId) {
      try {
        await pb.collection('users').delete(userId)
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
    await pb.collection('usuarios_perfil').update(perfilId, { status })
    if (userId) {
      try {
        await pb.collection('users').update(userId, { status })
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
    await pb.collection('usuarios_perfil').update(perfilId, { perfil })
    if (userId) {
      try {
        await pb.collection('users').update(userId, { perfil })
      } catch (err) {
        console.warn('Erro ao sincronizar perfil no users:', err)
      }
    }
  },

  async redefinirSenhaAdmin(userId: string, novaSenhaTemporaria: string): Promise<void> {
    if (!userId) throw new Error('ID do usuário não fornecido.')
    if (novaSenhaTemporaria.length < 8) {
      throw new Error('A senha deve ter no mínimo 8 caracteres.')
    }
    await pb.collection('users').update(userId, {
      password: novaSenhaTemporaria,
      passwordConfirm: novaSenhaTemporaria,
    })
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
