import React, { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
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
import { Snowflake, Lock, Mail, User, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const { login, register, requestPasswordReset, isLoading } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('marins.felipe@yahoo.com.br')
  const [password, setPassword] = useState('Skip@Pass')
  const [name, setName] = useState('')
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

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
        toast.error('Preencha e-mail e senha.')
        return
      }
      try {
        await register(email, password, name)
        toast.success('Cadastro realizado com sucesso!')
        navigate('/')
      } catch (err: any) {
        console.error(err)
        toast.error(err?.message || 'Erro ao realizar cadastro.')
      }
      return
    }

    // Modo login
    try {
      await login(email, password)
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
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 mb-1">
            <Snowflake className="h-8 w-8 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            ERP Refrigeração Comercial
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestão de Componentes, Engenharia de BOM e Precificação Industrial
          </p>
        </div>

        {/* Card do Formulário */}
        <Card className="border-border shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {mode === 'login' && 'Acesso da Equipe Interna'}
              {mode === 'register' && 'Cadastrar Novo Usuário'}
              {mode === 'forgot' && 'Recuperação de Senha'}
            </CardTitle>
            <CardDescription className="text-xs">
              {mode === 'login' &&
                'Entre com suas credenciais para acessar os módulos de engenharia'}
              {mode === 'register' && 'Crie seu acesso com verificação de e-mail'}
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
                      <Label htmlFor="nome">Nome Completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="nome"
                          type="text"
                          placeholder="Seu nome"
                          className="pl-9"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="email">E-mail Corporativo</Label>
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
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Senha</Label>
                        {mode === 'login' && (
                          <button
                            type="button"
                            onClick={() => {
                              setMode('forgot')
                              setResetSent(false)
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
                        />
                      </div>
                    </div>
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
                  'Concluir Cadastro'
                ) : (
                  'Enviar Link de Recuperação'
                )}
              </Button>

              <div className="text-center text-xs text-muted-foreground">
                {mode === 'login' ? (
                  <span>
                    Primeiro acesso da equipe?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('register')}
                      className="text-primary font-medium hover:underline"
                    >
                      Cadastre-se
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login')
                      setResetSent(false)
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
            Usuário Administrador Seed
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
