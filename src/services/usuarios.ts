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
}
