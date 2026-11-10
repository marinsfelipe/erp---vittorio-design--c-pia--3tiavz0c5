import React, { useState } from 'react'
import { useAuth, MSG_PENDENTE } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import {
  Snowflake,
  Lock,
  Mail,
  User,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate, useLocation } from 'react-router-dom'
import { VittorioLogo } from '@/components/VittorioLogo'

export default function LoginPage() {
  const { login, register, requestPasswordReset, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Mensagem passada por redirecionamento do ProtectedRoute
  const stateBloqueio = (location.state as any)?.bloqueio as string | undefined

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('marins.felipe@yahoo.com.br')
  const [password, setPassword] = useState('Skip@Pass')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [avisoPendente, setAvisoPendente] = useState<string | null>(stateBloqueio || null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAvisoPendente(null)

    if (mode === 'forgot') {
      if (!email.trim()) {
        toast.error('Informe seu e-mail cadastrado.')
        return
      }
      try {
        await requestPasswordReset(email.trim())
        setResetSent(true)
        toast.success('Link de recuperação enviado para seu e-mail!')
      } catch (err: any) {
        console.error(err)
        toast.error('Erro ao solicitar recuperação de senha.')
      }
      return
    }

    if (mode === 'register') {
      if (!email.trim() || !password) {
        toast.error('Preencha todos os campos obrigatórios.')
        return
      }
      if (password.length < 8) {
        toast.error('A senha deve conter no mínimo 8 caracteres.')
        return
      }
      if (password !== passwordConfirm) {
        toast.error('A confirmação da senha não confere.')
        return
      }

      try {
        const res = await register(email, password, name)
        setAvisoPendente(res.message || MSG_PENDENTE)
        toast.info(res.message || MSG_PENDENTE)
        // Retorna para o modo login com o aviso em destaque
        setMode('login')
        setPassword('')
        setPasswordConfirm('')
      } catch (err: any) {
        console.error(err)
        toast.error(err?.message || 'Erro ao realizar cadastro.')
      }
      return
    }

    // Modo login
    try {
      const res = await login(email, password)
      if (res.status === 'pendente') {
        setAvisoPendente(res.message || MSG_PENDENTE)
        toast.warning(res.message || MSG_PENDENTE)
        return
      }
      if (res.status === 'bloqueado') {
        setAvisoPendente(res.message || 'Sua conta está bloqueada. Procure o administrador.')
        toast.error(res.message || 'Sua conta está bloqueada.')
        return
      }
      toast.success('Acesso autorizado! Bem-vindo ao ERP.')
      navigate('/')
    } catch (err: any) {
      console.error(err)
      toast.error('E-mail ou senha incorretos.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Identidade Visual */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <VittorioLogo surface="dark-card" size="md" className="h-20" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Vittorio Design</h1>
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono mt-0.5">
              ERP de Equipamentos Comerciais Refrigerados
            </p>
          </div>
        </div>

        {/* Alerta de status pendente ou bloqueado */}
        {avisoPendente && (
          <div className="bg-amber-500/10 border border-amber-500/40 p-4 rounded-xl flex items-start gap-3 shadow-sm animate-in fade-in">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 dark:text-amber-200">
              <p className="font-semibold text-sm">Acesso Pendente de Aprovação</p>
              <p className="mt-1 leading-relaxed">{avisoPendente}</p>
            </div>
          </div>
        )}

        {/* Card do Formulário */}
        <Card className="border-border shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {mode === 'login' && 'Acesso da Equipe Interna'}
              {mode === 'register' && 'Criar Conta no ERP'}
              {mode === 'forgot' && 'Recuperação de Senha'}
            </CardTitle>
            <CardDescription className="text-xs">
              {mode === 'login' &&
                'Entre com suas credenciais para acessar os módulos de engenharia'}
              {mode === 'register' &&
                'Cadastre seus dados. O acesso será liberado após aprovação administrativa'}
              {mode === 'forgot' && 'Enviaremos instruções de redefinição para o seu e-mail'}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {resetSent && mode === 'forgot' ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-lg flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-950 dark:text-emerald-200">
                    <p className="font-semibold">E-mail de recuperação enviado!</p>
                    <p className="mt-1">
                      Verifique a caixa de entrada de <strong>{email}</strong> para redefinir sua
                      senha.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {mode === 'register' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="nome">Nome Completo *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="nome"
                          type="text"
                          placeholder="Ex: Carlos Alberto da Silva"
                          className="pl-9"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="email">E-mail Corporativo *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="usuario@refrigeracao.com.br"
                        className="pl-9"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {mode !== 'forgot' && (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">
                            {mode === 'register' ? 'Senha (mínimo 8 caracteres) *' : 'Senha'}
                          </Label>
                          {mode === 'login' && (
                            <button
                              type="button"
                              onClick={() => {
                                setMode('forgot')
                                setResetSent(false)
                                setAvisoPendente(null)
                              }}
                              className="text-[11px] text-primary hover:underline"
                            >
                              Esqueceu a senha?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            className="pl-9"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={mode === 'register' ? 8 : undefined}
                          />
                        </div>
                      </div>

                      {mode === 'register' && (
                        <div className="space-y-1.5">
                          <Label htmlFor="passwordConfirm">Confirmar Senha *</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="passwordConfirm"
                              type="password"
                              placeholder="••••••••"
                              className="pl-9"
                              value={passwordConfirm}
                              onChange={(e) => setPasswordConfirm(e.target.value)}
                              required
                              minLength={8}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button type="submit" disabled={isLoading} className="w-full gap-2">
                {isLoading ? (
                  'Processando...'
                ) : mode === 'login' ? (
                  <>
                    Entrar no ERP
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : mode === 'register' ? (
                  'Cadastrar e Aguardar Aprovação'
                ) : (
                  'Enviar Link de Recuperação'
                )}
              </Button>

              <div className="text-center text-xs text-muted-foreground">
                {mode === 'login' ? (
                  <span>
                    Ainda não tem acesso?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('register')
                        setAvisoPendente(null)
                      }}
                      className="text-primary font-medium hover:underline"
                    >
                      Criar conta
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login')
                      setResetSent(false)
                      setAvisoPendente(null)
                    }}
                    className="text-primary font-medium hover:underline"
                  >
                    Voltar ao Login
                  </button>
                )}
              </div>
            </CardFooter>
          </form>
        </Card>

        {/* Nota de credenciais pré-carregadas */}
        <div className="text-center text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border">
          <div className="flex items-center justify-center gap-1.5 font-medium text-foreground mb-1">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Primeiro Administrador
          </div>
          E-mail:{' '}
          <code className="font-mono text-primary font-semibold">
            marins.felipe@yahoo.com.br
          </code> |
          Senha: <code className="font-mono">Skip@Pass</code>
        </div>
      </div>
    </div>
  )
}
