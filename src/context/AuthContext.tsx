import React, { createContext, useContext, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import type { AuthUser } from '@/types/erp'
import { garantirPerfil, setPerfilLocal } from '@/lib/perfil'

export type PerfilAcesso = 'admin' | 'usuario'
export type StatusAcesso = 'pendente' | 'aprovado' | 'bloqueado'

interface AuthContextType {
  user: AuthUser | null
  perfil: PerfilAcesso
  status: StatusAcesso
  isAdmin: boolean
  isAprovado: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ status: StatusAcesso; message?: string }>
  logout: () => void
  requestPasswordReset: (email: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<{ message: string }>
  alterarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>
}

export const MSG_PENDENTE = 'Cadastro recebido. Aguarde a aprovação do administrador.'
export const MSG_BLOQUEADO = 'Sua conta está bloqueada. Procure o administrador.'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (pb.authStore.isValid && pb.authStore.record) {
      return {
        id: pb.authStore.record.id,
        email: pb.authStore.record.email || '',
        name: (pb.authStore.record.get('name') as string) || '',
        perfil: (pb.authStore.record.get('perfil') as 'admin' | 'usuario') || 'usuario',
        status: (pb.authStore.record.get('status') as StatusAcesso) || 'pendente',
      }
    }
    return null
  })

  const [perfil, setPerfil] = useState<PerfilAcesso>(() => {
    if (pb.authStore.isValid && pb.authStore.record) {
      return (
        (pb.authStore.record.get('perfil') as string) === 'admin' ? 'admin' : 'usuario'
      ) as PerfilAcesso
    }
    return 'usuario'
  })

  const [status, setStatus] = useState<StatusAcesso>(() => {
    if (pb.authStore.isValid && pb.authStore.record) {
      const s = pb.authStore.record.get('status') as string
      return (
        s === 'aprovado' || s === 'bloqueado' || s === 'pendente' ? s : 'pendente'
      ) as StatusAcesso
    }
    return 'pendente'
  })

  const [isLoading, setIsLoading] = useState(false)

  const isAdmin = perfil === 'admin'
  const isAprovado = status === 'aprovado'

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, model) => {
      if (model && pb.authStore.isValid) {
        const p = model.get?.('perfil') === 'admin' ? 'admin' : 'usuario'
        const s = (model.get?.('status') as StatusAcesso) || 'pendente'
        setUser({
          id: model.id,
          email: model.email || '',
          name: model.get?.('name') || '',
          perfil: p,
          status: s,
        })
        setPerfil(p)
        setStatus(s === 'aprovado' || s === 'bloqueado' || s === 'pendente' ? s : 'pendente')
      } else {
        setUser(null)
        setPerfil('usuario')
        setStatus('pendente')
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (
    email: string,
    pass: string,
  ): Promise<{ status: StatusAcesso; message?: string }> => {
    setIsLoading(true)
    try {
      const authData = await pb.collection('users').authWithPassword(email.trim(), pass)
      let s: StatusAcesso = 'pendente'
      let p: PerfilAcesso = 'usuario'

      if (authData?.record) {
        let recPerfil = (authData.record.get('perfil') as string) || ''
        let recStatus = (authData.record.get('status') as string) || ''

        if (!recStatus || !recPerfil) {
          const g = await garantirPerfil()
          recPerfil = g.perfil
          recStatus = g.status
        }

        p = recPerfil === 'admin' ? 'admin' : 'usuario'
        s =
          recStatus === 'aprovado' || recStatus === 'bloqueado' || recStatus === 'pendente'
            ? (recStatus as StatusAcesso)
            : 'pendente'

        setPerfilLocal(p, s)
        setPerfil(p)
        setStatus(s)
        setUser({
          id: authData.record.id,
          email: authData.record.email || '',
          name: authData.record.get('name') || '',
          perfil: p,
          status: s,
        })

        // Se pendente ou bloqueado, encerra a sessão na authStore para não autorizar o acesso
        if (s === 'pendente') {
          pb.authStore.clear()
          setUser(null)
          return { status: 'pendente' as const, message: MSG_PENDENTE }
        }
        if (s === 'bloqueado') {
          pb.authStore.clear()
          setUser(null)
          return { status: 'bloqueado' as const, message: MSG_BLOQUEADO }
        }
      }
      return { status: s }
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (email: string, pass: string, name?: string) => {
    setIsLoading(true)
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedEmail) throw new Error('E-mail é obrigatório.')
    if (!pass || pass.length < 8) {
      throw new Error('A senha deve conter no mínimo 8 caracteres.')
    }

    try {
      // Cria a conta no Auth do Skip Cloud com status pendente e sem necessidade de verificação por email
      const newUser = await pb.collection('users').create({
        email: trimmedEmail,
        password: pass,
        passwordConfirm: pass,
        name: name?.trim() || '',
        perfil: 'usuario',
        status: 'pendente',
      })

      // Cria o registro auxiliar na tabela usuarios_perfil
      try {
        await pb.collection('usuarios_perfil').create({
          user: newUser.id,
          nome: name?.trim() || trimmedEmail.split('@')[0],
          email: trimmedEmail,
          perfil: 'usuario',
          status: 'pendente',
        })
      } catch (errPerfil) {
        console.warn('Erro ao criar perfil complementar de usuário:', errPerfil)
      }

      // Garante que o usuário novo NÃO fica logado
      pb.authStore.clear()
      setUser(null)
      setPerfil('usuario')
      setStatus('pendente')

      return {
        message: MSG_PENDENTE,
      }
    } catch (err: any) {
      // Tratamento de email duplicado amigável
      const errMsg = err?.data?.data?.email?.message || err?.message || ''
      if (
        errMsg.toLowerCase().includes('unique') ||
        errMsg.toLowerCase().includes('already') ||
        errMsg.toLowerCase().includes('exists') ||
        errMsg.toLowerCase().includes('duplic')
      ) {
        throw new Error('Já existe uma conta cadastrada com este e-mail.')
      }
      throw new Error(errMsg || 'Erro ao realizar cadastro.')
    } finally {
      setIsLoading(false)
    }
  }

  const alterarSenha = async (senhaAtual: string, novaSenha: string) => {
    if (!pb.authStore.record) throw new Error('Sessão expirada. Faça login novamente.')
    if (!novaSenha || novaSenha.length < 8) {
      throw new Error('A nova senha deve ter no mínimo 8 caracteres.')
    }
    try {
      await pb.collection('users').update(pb.authStore.record.id, {
        oldPassword: senhaAtual,
        password: novaSenha,
        passwordConfirm: novaSenha,
      })
    } catch (err: any) {
      const fieldErrors = err?.data?.data
      if (fieldErrors?.oldPassword || err?.status === 400) {
        throw new Error('Senha atual incorreta.')
      }
      throw new Error(err?.message || 'Erro ao alterar senha.')
    }
  }

  const requestPasswordReset = async (email: string) => {
    await pb.collection('users').requestPasswordReset(email.trim())
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setPerfil('usuario')
    setStatus('pendente')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        perfil,
        status,
        isAdmin,
        isAprovado,
        isLoading,
        login,
        logout,
        requestPasswordReset,
        register,
        alterarSenha,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
