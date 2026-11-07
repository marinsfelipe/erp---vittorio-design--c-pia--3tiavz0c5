import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  Snowflake,
  Cpu,
  FileSpreadsheet,
  Layers,
  Calculator,
  Percent,
  ShoppingCart,
  LogOut,
  User,
  Menu,
  X,
  ChevronRight,
  Shield,
  FileSignature,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const navItems = [
  { path: '/componentes', label: 'Componentes', icon: Cpu },
  { path: '/importar', label: 'Importar Planilha', icon: FileSpreadsheet },
  { path: '/boms', label: 'BOMs por SKU', icon: Layers },
  { path: '/precificacao', label: 'Precificação', icon: Calculator },
  { path: '/parametros', label: 'Parâmetros', icon: Percent },
  { path: '/compras', label: 'Lista de Compras', icon: ShoppingCart },
  { path: '/propostas', label: 'Propostas', icon: FileSignature },
  { path: '/pedidos-compra', label: 'Compras', icon: ShoppingCart },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo e Nome */}
          <div className="flex items-center gap-3">
            <NavLink to="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
                <Snowflake className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-foreground tracking-tight">
                    ERP Refrigeração
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-4 uppercase font-semibold tracking-wider"
                  >
                    PROD
                  </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground block -mt-0.5">
                  Engenharia de BOM & Custos
                </span>
              </div>
            </NavLink>
          </div>

          {/* Navegação Desktop */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path))

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          {/* Usuário / Logout */}
          <div className="hidden sm:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2.5 pl-3 border-l border-border">
                <div className="text-right hidden md:block">
                  <p className="text-xs font-semibold text-foreground truncate max-w-[140px]">
                    {user.name || user.email.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[140px] font-mono">
                    {user.email}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={handleLogout}
                  title="Sair da Conta"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <NavLink to="/login">
                <Button size="sm" variant="default" className="text-xs">
                  Entrar
                </Button>
              </NavLink>
            )}
          </div>

          {/* Botão Menu Mobile */}
          <div className="flex lg:hidden items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Abrir menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Menu Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border bg-card p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path))

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between p-2.5 rounded-lg text-sm font-medium ${
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </NavLink>
              )
            })}

            <div className="pt-3 border-t border-border flex items-center justify-between">
              {user ? (
                <>
                  <div className="text-xs">
                    <p className="font-semibold text-foreground">{user.name || user.email}</p>
                    <p className="text-muted-foreground">{user.email}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="text-xs gap-1"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sair
                  </Button>
                </>
              ) : (
                <NavLink to="/login" className="w-full">
                  <Button size="sm" className="w-full">
                    Acessar ERP
                  </Button>
                </NavLink>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>

      {/* Rodapé Corporativo */}
      <footer className="border-t border-border bg-card/60 py-4 mt-auto print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} ERP Indústria de Refrigeração Comercial — Módulo de
            Engenharia e Custos
          </p>
          <div className="flex items-center gap-4">
            <span>Balcão Strongest</span>
            <span>•</span>
            <span>Vitrine Aprezzo</span>
            <span>•</span>
            <span>Expositor Fredda</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
