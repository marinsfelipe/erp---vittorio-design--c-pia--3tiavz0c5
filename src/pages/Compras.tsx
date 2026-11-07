import React, { useEffect, useState } from 'react'
import { ordensCompraService } from '@/services/ordensCompra'
import type { OrdemCompra, OrdemCompraItem, OrdemCompraStatus } from '@/types/erp'
import { formatBRL } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
  ShoppingCart,
  RefreshCw,
  CheckCircle2,
  Circle,
  PackageCheck,
  ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'

const statusLabels: Record<OrdemCompraStatus, string> = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  concluida: 'Concluída',
}

const statusColors: Record<OrdemCompraStatus, string> = {
  pendente: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  parcial: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  concluida: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

export default function ComprasPage() {
  const [ordens, setOrdens] = useState<OrdemCompra[]>([])
  const [itensPorOrdem, setItensPorOrdem] = useState<Record<string, OrdemCompraItem[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState<string | null>(null)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const allOrdens = await ordensCompraService.getAll()
      const entries = await Promise.all(
        allOrdens.map(async (o) => {
          try {
            return [o.id, await ordensCompraService.getItems(o.id)] as const
          } catch {
            return [o.id, [] as OrdemCompraItem[]] as const
          }
        }),
      )
      setOrdens(allOrdens)
      setItensPorOrdem(Object.fromEntries(entries))
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar ordens de compra.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleToggleComprado = async (item: OrdemCompraItem) => {
    setIsSaving(item.id)
    try {
      await ordensCompraService.marcarItemComprado(item.id, !item.comprado)
      setItensPorOrdem((prev) => ({
        ...prev,
        [item.ordem_id]: (prev[item.ordem_id] || []).map((i) =>
          i.id === item.id ? { ...i, comprado: !item.comprado } : i,
        ),
      }))
      const ordem = await ordensCompraService.getById(item.ordem_id)
      setOrdens((prev) => prev.map((o) => (o.id === ordem.id ? ordem : o)))
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao atualizar item.')
    } finally {
      setIsSaving(null)
    }
  }

  if (isLoading) {
    return <div className="text-center py-16 text-muted-foreground">Carregando compras...</div>
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Ordem de Compra</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Componentes consolidados de todas as propostas vendidas pendentes de compra — marque os
            itens conforme forem comprados
          </p>
        </div>
        <Button variant="outline" onClick={loadData} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {ordens.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="font-semibold text-foreground text-lg">Nenhuma ordem de compra</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              A ordem de compra é gerada automaticamente quando uma proposta é marcada como
              "Vendida" no módulo de Propostas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {ordens.map((ordem) => {
            const itens = itensPorOrdem[ordem.id] || []
            const total = itens.length
            const comprados = itens.filter((i) => i.comprado).length
            const custoTotal = itens.reduce((a, i) => a + (Number(i.custo_total) || 0), 0)
            const pct = total > 0 ? Math.round((comprados / total) * 100) : 0

            return (
              <Card key={ordem.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <PackageCheck className="h-5 w-5 text-primary" />
                        Ordem {ordem.numero || '—'}
                      </CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-3 text-xs">
                        <span>{total} itens</span>
                        <span>•</span>
                        <span className="font-mono">{formatBRL(custoTotal)}</span>
                        <span>•</span>
                        <span>
                          {comprados} de {total} comprados ({pct}%)
                        </span>
                      </CardDescription>
                    </div>
                    <Badge className={`${statusColors[ordem.status]} text-xs font-semibold`}>
                      {statusLabels[ordem.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {itens.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Todos os itens já foram comprados. A ordem será consolidada na próxima venda.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20">
                          <TableHead className="w-12 font-semibold">OK</TableHead>
                          <TableHead className="font-semibold">Código</TableHead>
                          <TableHead className="font-semibold">Descrição</TableHead>
                          <TableHead className="font-semibold">Categoria</TableHead>
                          <TableHead className="font-semibold">Fornecedor</TableHead>
                          <TableHead className="text-right font-semibold">Qtd Total</TableHead>
                          <TableHead className="text-right font-semibold">Custo Unit.</TableHead>
                          <TableHead className="text-right font-semibold">Custo Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itens.map((item) => (
                          <TableRow
                            key={item.id}
                            className={item.comprado ? 'opacity-60' : 'hover:bg-muted/30'}
                          >
                            <TableCell>
                              <Checkbox
                                checked={item.comprado}
                                onCheckedChange={() => handleToggleComprado(item)}
                                disabled={isSaving === item.id}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs font-bold text-primary">
                              {item.codigo}
                            </TableCell>
                            <TableCell className="text-sm">{item.descricao}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.categoria}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.fornecedor}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">
                              {item.quantidade}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatBRL(item.custo_unitario)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">
                              {formatBRL(item.custo_total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
