import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Download, HandCoins, Undo2, Wallet } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { comissoesService } from '@/services/comissoes'
import { usuariosService } from '@/services/usuarios'
import type { Comissao } from '@/types/financeiro'
import { LABEL_STATUS_COMISSAO } from '@/types/financeiro'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { exportarComissoesXlsx } from '@/utils/comissoesExport'
import { toast } from 'sonner'

interface VendedorOpcao {
  id: string
  nome: string
}

export default function ComissoesPage() {
  const { isAdmin } = useAuth()
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [vendedores, setVendedores] = useState<VendedorOpcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')

  // Diálogo "Marcar como paga"
  const [pagaDialog, setPagaDialog] = useState<Comissao | null>(null)
  const [dataPagamento, setDataPagamento] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [lista, listaVendedores] = await Promise.all([
        comissoesService.listar(),
        isAdmin ? usuariosService.getAll() : Promise.resolve([]),
      ])
      setComissoes(lista)
      setVendedores(
        listaVendedores
          .filter((u) => u.perfil === 'vendedor' && u.status !== 'bloqueado')
          .map((u) => ({ id: u.user, nome: u.nome || u.email || u.user })),
      )
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao carregar comissões.')
    } finally {
      setCarregando(false)
    }
  }, [isAdmin])

  useEffect(() => {
    carregar()
  }, [carregar])

  const comissoesFiltradas = useMemo(() => {
    return comissoes.filter((c) => {
      if (filtroVendedor !== 'todos' && c.vendedor !== filtroVendedor) return false
      if (filtroStatus === 'prevista' && c.status !== 'prevista') return false
      if (filtroStatus === 'paga' && c.status !== 'paga') return false
      return true
    })
  }, [comissoes, filtroVendedor, filtroStatus])

  const totais = useMemo(() => {
    let previsto = 0
    let pago = 0
    for (const c of comissoesFiltradas) {
      if (c.status === 'paga') pago += Number(c.valor) || 0
      else if (c.status === 'prevista') previsto += Number(c.valor) || 0
    }
    return { previsto, pago }
  }, [comissoesFiltradas])

  const abrirMarcarPaga = (c: Comissao) => {
    setDataPagamento(new Date().toISOString().split('T')[0])
    setPagaDialog(c)
  }

  const confirmarMarcarPaga = async () => {
    if (!pagaDialog) return
    if (!dataPagamento) {
      toast.error('Informe a data de pagamento.')
      return
    }
    setSalvando(true)
    try {
      await comissoesService.marcarPaga(pagaDialog.id, dataPagamento)
      toast.success('Comissão marcada como paga.')
      setPagaDialog(null)
      await carregar()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao marcar comissão como paga.')
    } finally {
      setSalvando(false)
    }
  }

  const estornar = async (c: Comissao) => {
    try {
      await comissoesService.estornar(c.id)
      toast.success('Comissão estornada (voltou para Prevista).')
      await carregar()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao estornar comissão.')
    }
  }

  const exportar = () => {
    if (comissoesFiltradas.length === 0) {
      toast.error('Nada para exportar com os filtros atuais.')
      return
    }
    exportarComissoesXlsx(comissoesFiltradas, isAdmin ? 'Comissões' : 'Minhas Comissões')
  }

  const nomeVendedor = (c: Comissao) => c.expand?.vendedor?.name || c.vendedor_nome || '—'

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            {isAdmin ? 'Comissões' : 'Minhas Comissões'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? 'Comissões geradas automaticamente quando uma proposta é marcada como Vendida.'
              : 'Suas comissões sobre propostas vendidas. Somente leitura.'}
          </p>
        </div>
        <Button variant="outline" onClick={exportar} disabled={comissoesFiltradas.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Exportar .xlsx
        </Button>
      </div>

      {/* Cartões de resumo */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Total previsto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatBRL(totais.previsto)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <HandCoins className="h-4 w-4" /> Total pago
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatBRL(totais.pago)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        {isAdmin && (
          <div className="w-full sm:w-64">
            <Label className="mb-1.5 block text-xs">Vendedor</Label>
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedores.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="w-full sm:w-56">
          <Label className="mb-1.5 block text-xs">Status</Label>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="prevista">Prevista</SelectItem>
              <SelectItem value="paga">Paga</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {carregando ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando comissões…</p>
          ) : comissoesFiltradas.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium">Nenhum registro encontrado</p>
              <p className="mt-1 text-xs text-muted-foreground">
                As comissões são geradas automaticamente quando uma proposta é marcada como
                "Vendida". Ajuste os filtros ou aguarde novas vendas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Proposta</TableHead>
                    <TableHead className="text-right">Valor base</TableHead>
                    <TableHead className="text-right">Percentual</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pagamento</TableHead>
                    {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comissoesFiltradas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{nomeVendedor(c)}</TableCell>
                      <TableCell>{c.proposta_numero || '—'}</TableCell>
                      <TableCell className="text-right">{formatBRL(c.valor_base)}</TableCell>
                      <TableCell className="text-right">{formatPercent(c.percentual)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatBRL(c.valor)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={c.status === 'paga' ? 'default' : 'secondary'}
                          className={
                            c.status === 'paga'
                              ? 'bg-green-600 text-white'
                              : 'bg-amber-500/15 text-amber-700'
                          }
                        >
                          {LABEL_STATUS_COMISSAO[c.status] || c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.data_pagamento
                          ? new Date(c.data_pagamento).toLocaleDateString('pt-BR')
                          : '—'}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          {c.status === 'prevista' ? (
                            <Button size="sm" variant="outline" onClick={() => abrirMarcarPaga(c)}>
                              <HandCoins className="h-3.5 w-3.5 mr-1" /> Marcar como paga
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => estornar(c)}
                              title="Voltar para Prevista"
                            >
                              <Undo2 className="h-3.5 w-3.5 mr-1" /> Estornar
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo Marcar como paga */}
      <Dialog open={!!pagaDialog} onOpenChange={(open) => !open && setPagaDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar comissão como paga</DialogTitle>
            <DialogDescription>
              {pagaDialog && (
                <>
                  Comissão de {nomeVendedor(pagaDialog)} sobre a proposta{' '}
                  {pagaDialog.proposta_numero || '—'} — {formatBRL(pagaDialog.valor)}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="data-pagamento">Data de pagamento</Label>
            <Input
              id="data-pagamento"
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagaDialog(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={confirmarMarcarPaga} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
