import pb from '@/lib/pocketbase/client'
import { usuariosService } from '@/services/usuarios'

/**
 * Garante que existe um registro `usuarios_perfil` para o usuário logado.
 * Retorna: { perfil, status }
 */
export async function garantirPerfil(): Promise<{
  perfil: 'admin' | 'usuario'
  status: 'pendente' | 'aprovado' | 'bloqueado'
}> {
  const userId = pb.authStore.record?.id
  if (!userId) {
    return { perfil: 'usuario', status: 'bloqueado' }
  }

  let perfil = (pb.authStore.record?.get('perfil') as string) || ''
  let status = (pb.authStore.record?.get('status') as string) || ''

  if (!status || !perfil) {
    // Consulta/cria o perfil auxiliar
    let p = await usuariosService.getMeu()
    if (!p) {
      const nome = (pb.authStore.record?.get('name') as string) || userId
      const email = pb.authStore.record?.email || ''
      try {
        p = await pb.collection('usuarios_perfil').create({
          user: userId,
          nome,
          email,
          perfil: 'usuario',
          status: 'pendente',
        })
      } catch {
        p = await usuariosService.getMeu()
      }
    }
    if (p) {
      perfil = p.perfil || perfil || 'usuario'
      status = p.status || status || 'pendente'
    }
  }

  const finalPerfil = perfil === 'admin' ? 'admin' : 'usuario'
  const finalStatus =
    status === 'aprovado' || status === 'bloqueado' || status === 'pendente' ? status : 'pendente'

  return {
    perfil: finalPerfil,
    status: finalStatus,
  }
}

/** Atualiza o cache local (authStore) com o perfil/status mais recente. */
export function setPerfilLocal(perfil: string, status: string) {
  const rec = pb.authStore.record
  if (!rec) return
  rec.set('perfil', perfil)
  rec.set('status', status)
  pb.authStore.save(rec.token ?? pb.authStore.token, rec)
}
