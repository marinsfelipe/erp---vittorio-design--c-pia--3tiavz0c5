import React, { useState, useEffect } from 'react'
import { Link, useLocation, Outlet } from 'react-router-dom'
import {
  Layers,
  Database,
  Upload,
  Sliders,
  DollarSign,
  FileSpreadsheet,
  ShoppingCart,
  Menu,
  X,
  Snowflake,
  LogOut,
  User,
  Users,
  ShieldCheck,
  KeyRound,
  Package,
  Building2,
  Kanban,
  FileSignature,
  ScrollText,
  Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/context/AuthContext'
import { usuariosService } from '@/services/usuarios'
import { toast } from 'sonner'

export default function Layout() {
  const location = useLocation()
  const { user, perfil, isAdmin, isVendedor, logout, alterarSenha } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [pendentesCount, setPendentesCount] = useState<number>(0)

  // Estado do modal de "Alterar Senha" do usuário logado
  const [alterarSenhaOpen, setAlterarSenhaOpen] = useState(false)
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novaSenhaConfirm, setNovaSenhaConfirm] = useState('')
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  // Se for admin, carrega e monitora a contagem de cadastros pendentes
  useEffect(() => {
    if (!isAdmin) return

    let isMounted = true
    const carregarPendentes = async () => {
      try {
        const lista = await usuariosService.getAll()
        if (isMounted) {
          const count = lista.filter((u) => u.status === 'pendente').length
          setPendentesCount(count)
        }
      } catch (err) {
        // silencioso
      }
    }

    carregarPendentes()
    const timer = setInterval(carregarPendentes, 15000)
    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [isAdmin, location.pathname])

  const handleSalvarSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!senhaAtual) {
      toast.error('Informe a senha atual.')
      return
    }
    if (novaSenha.length < 8) {
      toast.error('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (novaSenha !== novaSenhaConfirm) {
      toast.error('A confirmação da nova senha não confere.')
      return
    }

    setSalvandoSenha(true)
    try {
      await alterarSenha(senhaAtual, novaSenha)
      toast.success('Senha alterada com sucesso!')
      setAlterarSenhaOpen(false)
      setSenhaAtual('')
      setNovaSenha('')
      setNovaSenhaConfirm('')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao alterar senha.')
    } finally {
      setSalvandoSenha(false)
    }
  }

  // Links do menu lateral:
  // - Vendedor: Pipeline, Propostas, Contratos, Faturamentos, Catálogo, Clientes (NÃO vê BOMs, Compras, Parâmetros nem Usuários)
  // - Usuário comum: Painel, Pipeline, Propostas, Contratos, Faturamentos, Catálogo, Clientes, Componentes, Importação, BOMs, Precificação, Compras
  // - Administrador: Todos os anteriores + Usuários, Parâmetros Financeiros e Modelos de Contrato
  const navItems = isVendedor
    ? [
        { href: '/pipeline', label: 'Pipeline Comercial', icon: Kanban, adminOnly: false },
        {
          href: '/propostas',
          label: 'Propostas Comerciais',
          icon: FileSpreadsheet,
          adminOnly: false,
        },
        { href: '/contratos', label: 'Contratos Gerados', icon: ScrollText, adminOnly: false },
        {
          href: '/faturamentos',
          label: 'Faturamentos (Pré-Notas)',
          icon: Receipt,
          adminOnly: false,
        },
        { href: '/catalogo', label: 'Catálogo de Produtos', icon: Package, adminOnly: false },
        { href: '/clientes', label: 'Clientes', icon: Building2, adminOnly: false },
      ]
    : [
        { href: '/', label: 'Painel Geral', icon: Layers, adminOnly: false },
        { href: '/pipeline', label: 'Pipeline Comercial', icon: Kanban, adminOnly: false },
        {
          href: '/propostas',
          label: 'Propostas Comerciais',
          icon: FileSpreadsheet,
          adminOnly: false,
        },
        { href: '/contratos', label: 'Contratos Gerados', icon: ScrollText, adminOnly: false },
        {
          href: '/faturamentos',
          label: 'Faturamentos (Pré-Notas)',
          icon: Receipt,
          adminOnly: false,
        },
        { href: '/catalogo', label: 'Catálogo de Produtos', icon: Package, adminOnly: false },
        { href: '/clientes', label: 'Clientes', icon: Building2, adminOnly: false },
        { href: '/componentes', label: 'Componentes', icon: Database, adminOnly: false },
        { href: '/importar', label: 'Importar Componentes', icon: Upload, adminOnly: false },
        { href: '/boms', label: 'Engenharia de BOMs', icon: Snowflake, adminOnly: false },
        {
          href: '/precificacao',
          label: 'Simular Precificação',
          icon: DollarSign,
          adminOnly: false,
        },
        { href: '/compras', label: 'Módulo de Compras', icon: ShoppingCart, adminOnly: false },
        {
          href: '/usuarios',
          label: 'Usuários',
          icon: Users,
          adminOnly: true,
          badge: pendentesCount > 0 ? pendentesCount : undefined,
        },
        {
          href: '/parametros',
          label: 'Parâmetros Financeiros',
          icon: Sliders,
          adminOnly: true,
        },
        {
          href: '/modelos-contrato',
          label: 'Modelos de Contrato',
          icon: FileSignature,
          adminOnly: true,
        },
      ]

  const filteredNavItems = navItems.filter((item) => !item.adminOnly || isAdmin)

  const homeLink = isVendedor ? '/pipeline' : '/'

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border bg-card/60 backdrop-blur-sm">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Link to={homeLink} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
              <Snowflake className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight block">Vittorio Design</span>
              <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block">
                ERP Refrigeração
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon
            const active =
              item.href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <Badge
                    variant="secondary"
                    className={`text-[10px] h-5 px-1.5 font-bold ${
                      active
                        ? 'bg-primary-foreground text-primary'
                        : 'bg-amber-500 text-white dark:bg-amber-600'
                    }`}
                  >
                    {item.badge}
                  </Badge>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Perfil do Usuário e Menu de Ações */}
        <div className="p-3 border-t border-border bg-muted/20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/60 transition-colors text-left">
                <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {user?.name || user?.email || 'Usuário'}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1 font-mono">
                    <ShieldCheck className="h-3 w-3 text-primary inline" />
                    {perfil === 'admin'
                      ? 'Administrador'
                      : perfil === 'vendedor'
                        ? 'Vendedor'
                        : 'Usuário'}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal text-xs">
                <div className="font-medium text-foreground truncate">
                  {user?.name || 'Usuário'}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">
                  {user?.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs cursor-pointer gap-2"
                onClick={() => setAlterarSenhaOpen(true)}
              >
                <KeyRound className="h-4 w-4" />
                Alterar senha
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem className="text-xs cursor-pointer gap-2" asChild>
                  <Link to="/usuarios">
                    <Users className="h-4 w-4" />
                    Gerenciar usuários
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs cursor-pointer text-destructive focus:text-destructive gap-2"
                onClick={logout}
              >
                <LogOut className="h-4 w-4" />
                Sair do sistema
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Header Mobile */}
      <header className="md:hidden border-b border-border bg-card/80 backdrop-blur-sm p-3 flex items-center justify-between sticky top-0 z-20">
        <Link to={homeLink} className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
            <Snowflake className="h-4 w-4" />
          </div>
          <div>
            <span className="font-bold text-xs tracking-tight">Vittorio Design</span>
          </div>
        </Link>
        <div className="flex items-center gap-1">
          {pendentesCount > 0 && isAdmin && (
            <Link to="/usuarios">
              <Badge className="bg-amber-500 text-white text-[10px] px-1.5 h-5">
                {pendentesCount}
              </Badge>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="h-8 w-8"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Menu Mobile */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-card p-3 space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon
            const active =
              item.href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5 bg-amber-500 text-white">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            )
          })}
          <div className="pt-2 border-t border-border flex flex-col gap-1">
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                setAlterarSenhaOpen(true)
              }}
              className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted rounded-lg text-left"
            >
              <KeyRound className="h-4 w-4" />
              <span>Alterar senha</span>
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 rounded-lg text-left"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair do sistema</span>
            </button>
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
        <Outlet />
      </main>

      {/* Diálogo "Alterar Senha" do Usuário Logado */}
      <Dialog open={alterarSenhaOpen} onOpenChange={setAlterarSenhaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Alterar Minha Senha
            </DialogTitle>
            <DialogDescription>
              Informe sua senha atual para validação de segurança e defina a nova senha.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarSenha} className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="senha-atual">Senha Atual *</Label>
              <Input
                id="senha-atual"
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha-nova">Nova Senha (mínimo 8 caracteres) *</Label>
              <Input
                id="senha-nova"
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha-nova-confirm">Confirmar Nova Senha *</Label>
              <Input
                id="senha-nova-confirm"
                type="password"
                value={novaSenhaConfirm}
                onChange={(e) => setNovaSenhaConfirm(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAlterarSenhaOpen(false)}
                disabled={salvandoSenha}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvandoSenha}>
                {salvandoSenha ? 'Alterando...' : 'Salvar Nova Senha'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
