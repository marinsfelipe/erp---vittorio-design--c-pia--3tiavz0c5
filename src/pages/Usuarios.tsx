import React, { useEffect, useState } from 'react'
import { usuariosService } from '@/services/usuarios'
import { useAuth } from '@/context/AuthContext'
import type { UsuarioPerfil } from '@/types/erp'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Users,
  CheckCircle2,
  Ban,
  Trash2,
  KeyRound,
  Clock,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/utils/formatters'

export default function UsuariosPage() {
  const { user } = useAuth()
  const [lista, setLista] = useState<UsuarioPerfil[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [excluirTarget, setExcluirTarget] = useState<UsuarioPerfil | null>(null)
  const [resetTarget, setResetTarget] = useState<UsuarioPerfil | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const data = await usuariosService.getAll()
      setLista(data)
    } catch (err: any) {
      console.error(err)
      const isForbidden = err?.status === 403 || err?.response?.status === 403
      toast.error(
        isForbidden
          ? 'Acesso restrito a administradores.'
          : 'Erro ao carregar a lista de usuários.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const pendentes = lista.filter((u) => u.status === 'pendente')

  const handleAprovar = async (u: UsuarioPerfil) => {
    try {
      await usuariosService.setStatus(u.id, u.user, 'aprovado')
      toast.success(`${u.nome} foi aprovado com sucesso!`)
      await loadData()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao aprovar usuário.')
    }
  }

  const handleToggleBloqueio = async (u: UsuarioPerfil) => {
    const novoStatus = u.status === 'bloqueado' ? 'aprovado' : 'bloqueado'
    try {
      await usuariosService.setStatus(u.id, u.user, novoStatus)
      toast.success(novoStatus === 'bloqueado' ? 'Usuário bloqueado.' : 'Usuário desbloqueado.')
      await loadData()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao alterar status do usuário.')
    }
  }

  const handleConfirmExcluir = async () => {
    if (!excluirTarget) return
    try {
      await usuariosService.delete(excluirTarget.id, excluirTarget.user)
      toast.success(`Usuário ${excluirTarget.nome} excluído.`)
      setExcluirTarget(null)
      await loadData()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao excluir usuário.')
    }
  }

  const handleRedefinirSenha = async () => {
    if (!resetTarget) return
    if (!novaSenha.trim() || novaSenha.length < 8) {
      toast.error('A senha temporária deve conter no mínimo 8 caracteres.')
      return
    }

    setResetLoading(true)
    try {
      await usuariosService.redefinirSenhaAdmin(resetTarget.user, novaSenha)
      toast.success(`Senha temporária definida para ${resetTarget.nome}!`)
      setResetOpen(false)
      setNovaSenha('')
      setResetTarget(null)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao redefinir senha.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Controle de Usuários
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aprovação administrativa, bloqueio/desbloqueio e gestão de senhas da equipe
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Destaque no topo para cadastros pendentes de aprovação */}
      {pendentes.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {pendentes.length} cadastro{pendentes.length > 1 ? 's' : ''} pendente
              {pendentes.length > 1 ? 's' : ''} de aprovação
            </CardTitle>
            <CardDescription className="text-xs text-amber-900/70 dark:text-amber-300/70">
              Novos usuários que criaram conta e aguardam liberação pelo administrador para acessar
              o ERP
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {pendentes.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-card"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{u.nome}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {u.email || '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Cadastrado em {formatDateTime(u.created)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleAprovar(u)}
                    >
                      <UserCheck className="h-4 w-4" />
                      Aprovar Acesso
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive hover:bg-destructive/10"
                      onClick={() => setExcluirTarget(u)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Recusar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de todos os usuários */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Todos os Usuários Cadastrados ({lista.length})
          </CardTitle>
          <CardDescription className="text-xs">
            Apenas usuários com status &quot;Aprovado&quot; conseguem fazer login e navegar no
            sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data de Cadastro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((u) => {
                const isCurrentUser = u.user === user?.id
                return (
                  <TableRow
                    key={u.id}
                    className={u.status === 'pendente' ? 'bg-amber-500/5' : undefined}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{u.nome}</span>
                        {isCurrentUser && (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 px-1.5 border-primary text-primary"
                          >
                            Você
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{u.email || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={u.perfil === 'admin' ? 'default' : 'secondary'}>
                        {u.perfil === 'admin' ? 'Administrador' : 'Usuário'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(u.created)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        {u.status === 'pendente' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                            title="Aprovar usuário"
                            onClick={() => handleAprovar(u)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        )}

                        {u.status !== 'pendente' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className={`h-8 w-8 ${
                              u.status === 'bloqueado'
                                ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950'
                                : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950'
                            }`}
                            disabled={isCurrentUser}
                            title={
                              u.status === 'bloqueado' ? 'Desbloquear usuário' : 'Bloquear usuário'
                            }
                            onClick={() => handleToggleBloqueio(u)}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}

                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                          title="Redefinir senha temporária"
                          onClick={() => {
                            setResetTarget(u)
                            setNovaSenha('')
                            setResetOpen(true)
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>

                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          title="Excluir usuário"
                          disabled={isCurrentUser}
                          onClick={() => setExcluirTarget(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}

              {lista.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                    Nenhum usuário cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Diálogo do Administrador para Redefinir Senha */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Redefinir Senha de Usuário
            </DialogTitle>
            <DialogDescription>
              Defina uma senha temporária para <strong>{resetTarget?.nome}</strong> (
              {resetTarget?.email}). O usuário poderá utilizá-la imediatamente para entrar no
              sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="nova-senha-temp">Nova Senha Temporária *</Label>
              <Input
                id="nova-senha-temp"
                type="text"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Mínimo 8 caracteres (ex: Vittorio@2026)"
              />
              <p className="text-[11px] text-muted-foreground">
                A senha é alterada de forma segura diretamente na autenticação do Skip Cloud.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetLoading}>
              Cancelar
            </Button>
            <Button onClick={handleRedefinirSenha} disabled={resetLoading}>
              {resetLoading ? 'Salvando...' : 'Salvar Nova Senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog open={!!excluirTarget} onOpenChange={(o) => !o && setExcluirTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o usuário <strong>{excluirTarget?.nome}</strong> (
              {excluirTarget?.email})? Essa ação cancelará todo o acesso ao ERP e removerá tanto a
              conta de login quanto o perfil do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmExcluir}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Usuário
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'aprovado') {
    return (
      <Badge
        variant="outline"
        className="text-emerald-700 dark:text-emerald-400 border-emerald-600"
      >
        Aprovado
      </Badge>
    )
  }
  if (status === 'pendente') {
    return (
      <Badge
        variant="outline"
        className="text-amber-700 dark:text-amber-400 border-amber-600 bg-amber-50 dark:bg-amber-950/30"
      >
        Pendente
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-rose-700 dark:text-rose-400 border-rose-600">
      Bloqueado
    </Badge>
  )
}
