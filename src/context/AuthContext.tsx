import React, { createContext, useContext, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import type { AuthUser } from '@/types/erp'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  requestPasswordReset: (email: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (pb.authStore.isValid && pb.authStore.record) {
      return {
        id: pb.authStore.record.id,
        email: pb.authStore.record.email || '',
        name: pb.authStore.record.name || '',
      }
    }
    return null
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, model) => {
      if (model && pb.authStore.isValid) {
        setUser({
          id: model.id,
          email: model.email || '',
          name: model.name || '',
        })
      } else {
        setUser(null)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, pass: string) => {
    setIsLoading(true)
    try {
      const authData = await pb.collection('users').authWithPassword(email.trim(), pass)
      if (authData?.record) {
        setUser({
          id: authData.record.id,
          email: authData.record.email || '',
          name: authData.record.name || '',
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (email: string, pass: string, name?: string) => {
    setIsLoading(true)
    try {
      await pb.collection('users').create({
        email: email.trim(),
        password: pass,
        passwordConfirm: pass,
        name: name || '',
      })
      // Tentar enviar verificação de e-mail se configurado
      try {
        await pb.collection('users').requestVerification(email.trim())
      } catch (e) {
        console.warn('Verificação de e-mail opcional:', e)
      }
      await login(email, pass)
    } finally {
      setIsLoading(false)
    }
  }

  const requestPasswordReset = async (email: string) => {
    await pb.collection('users').requestPasswordReset(email.trim())
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, logout, requestPasswordReset, register }}
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
