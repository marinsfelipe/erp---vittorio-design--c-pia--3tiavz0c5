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

  const authRec = pb.authStore.record as any
  let perfil =
    (authRec?.perfil as string) ||
    (typeof authRec?.get === 'function' ? authRec.get('perfil') : '') ||
    ''
  let status =
    (authRec?.status as string) ||
    (typeof authRec?.get === 'function' ? authRec.get('status') : '') ||
    ''

  if (!status || !perfil) {
    // Consulta/cria o perfil auxiliar
    let p = await usuariosService.getMeu()
    if (!p) {
      const nome =
        (authRec?.name as string) ||
        (typeof authRec?.get === 'function' ? authRec.get('name') : '') ||
        userId
      const email = (authRec?.email as string) || ''
      try {
        p = await pb.collection('usuarios_perfil').create({
          user: userId,
          nome,
          email,
          perfil: perfil || 'usuario',
          status: status || 'pendente',
        })
      } catch {
        p = await usuariosService.getMeu()
      }
    }
    if (p) {
      perfil = perfil || p.perfil || 'usuario'
      status = status || p.status || 'pendente'
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
  const token = pb.authStore.token
  const updatedRec = {
    ...rec,
    perfil,
    status,
  }
  pb.authStore.save(token, updatedRec as any)
}
