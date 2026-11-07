import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

interface ProtectedRouteProps {
  apenasAdmin?: boolean
}

export default function ProtectedRoute({ apenasAdmin = false }: ProtectedRouteProps) {
  const { user, isLoading, status, isAdmin } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">Verificando sessão de acesso...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Guarda de aprovação: pendente ou bloqueado volta ao login com a mensagem
  if (status !== 'aprovado') {
    const msg =
      status === 'bloqueado'
        ? 'Sua conta está bloqueada. Procure o administrador.'
        : 'Cadastro recebido. Aguarde a aprovação do administrador.'
    return (
      <Navigate
        to="/login"
        replace
        state={{
          bloqueio: msg,
          icon: status === 'bloqueado' ? 'lock' : 'clock',
        }}
      />
    )
  }

  // Guarda de perfil de administrador
  if (apenasAdmin && !isAdmin) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
