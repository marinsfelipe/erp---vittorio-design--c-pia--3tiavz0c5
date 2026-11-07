import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { bomsService } from '@/services/boms'
import { propostasService, montarItensProposta, type PropostaItemInput } from '@/services/propostas'
import { parametrosService } from '@/services/parametros'
import { calcularMarkupDivisor, montarPercentuais } from '@/utils/pricing'
import type { Bom, Proposta, Parametro } from '@/types/erp'
import { formatBRL } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FileText, Plus, Trash2, Eye, FileSignature, Search } from 'lucide-react'
import { toast } from 'sonner'

const statusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  vendida: 'Vendida',
}

const statusColors: Record<string, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  enviada: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  vendida: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

export default function PropostasPage() {
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [pMap, setPMap] = useState<Record<string, number>>({})

  // Formulário de nova proposta
  const [cliente, setCliente] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [selecoes, setSelecoes] = useState<Record<string, number>>({})

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [allPropostas, allBoms, paramsMap] = await Promise.all([
        propostasService.getAll(),
        bomsService.getAll(),
        parametrosService.getMap(),
      ])
      setPropostas(allPropostas)
      setBoms(allBoms)
      setPMap(paramsMap)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar propostas.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenCreate = () => {
    setCliente('')
    setObservacoes('')
    setSelecoes({})
    setIsDialogOpen(true)
  }

  // Cache local de itens de BOM para exibição do valor enquanto o usuário edita.
  // Declarado ANTES de qualquer uso para evitar TDZ ("Cannot access before initialization").
  const [bomItemsCache, setBomItemsCache] = useState<Record<string, any[]>>({})
  useEffect(() => {
    const loadItems = async () => {
      const cache: Record<string, any[]> = {}
      await Promise.all(
        boms.map(async (b) => {
          try {
            cache[b.id] = await bomsService.getItems(b.id)
          } catch {
            cache[b.id] = []
          }
        }),
      )
      setBomItemsCache(cache)
    }
    if (isDialogOpen && boms.length > 0) loadItems()
  }, [isDialogOpen, boms])

  const valorTotalSelecao = Object.entries(selecoes).reduce((acc, [bomId, qtd]) => {
    const bom = boms.find((b) => b.id === bomId)
    if (!bom || !qtd) return acc
    // Mesma fórmula da precificação (markup divisor): custo / (1 − Σ%),
    // com os percentuais da tabela de parâmetros + override do SKU.
    const items = bomItemsCache[bomId] || []
    const custo = items.reduce(
      (a, it) => a + (Number(it.quantidade) || 0) * (Number(it.custo_unitario) || 0),
      0,
    )
    const percentuais = montarPercentuais(pMap, {
      overhead: bom.overhead_percentual,
      margem: bom.margem_percentual,
    })
    const precoVenda = calcularMarkupDivisor(custo, percentuais).precoVenda
    return acc + precoVenda * qtd
  }, 0)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const selecionados = Object.entries(selecoes).filter(([, qtd]) => qtd > 0)
    if (!cliente.trim()) {
      toast.error('Informe o nome do cliente.')
      return
    }
    if (selecionados.length === 0) {
      toast.error('Selecione pelo menos um SKU com quantidade.')
      return
    }
    setIsSaving(true)
    try {
      const selecoesArr = selecionados.map(([bomId, qtd]) => ({
        bom: boms.find((b) => b.id === bomId)!,
        quantidade: qtd,
      }))
      const itens: PropostaItemInput[] = await montarItensProposta(selecoesArr)
      await propostasService.create(cliente.trim(), observacoes.trim(), itens)
      toast.success('Proposta criada com sucesso!')
      setIsDialogOpen(false)
      loadData()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao criar proposta.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string, numero: string) => {
    if (!window.confirm(`Excluir a proposta ${numero}?`)) return
    setIsDeleting(id)
    try {
      await propostasService.delete(id)
      toast.success('Proposta excluída.')
      setPropostas((prev) => prev.filter((p) => p.id !== id))
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir proposta.')
    } finally {
      setIsDeleting(null)
    }
  }

  const propostasFiltradas = propostas.filter((p) => {
    if (!searchTerm.trim()) return true
    const q = searchTerm.toLowerCase()
    return (
      p.numero.toLowerCase().includes(q) ||
      p.cliente.toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Propostas de Venda
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Crie propostas selecionando SKUs e quantidades — o valor usa o preço de venda da
            precificação
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Proposta
        </Button>
      </div>

      {/* Busca */}
      <div className="relative md:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por cliente, número ou status..."
          className="pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Tabela de propostas */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Carregando propostas...</div>
      ) : propostasFiltradas.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <FileSignature className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="font-semibold text-foreground text-lg">Nenhuma proposta criada</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Crie a primeira proposta selecionando os SKUs desejados e as quantidades para o
              cliente.
            </p>
            <Button onClick={handleOpenCreate} className="mt-2">
              Criar Primeira Proposta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="font-semibold">Número</TableHead>
                <TableHead className="font-semibold">Cliente</TableHead>
                <TableHead className="font-semibold text-center">Status</TableHead>
                <TableHead className="font-semibold text-right">Valor Total</TableHead>
                <TableHead className="font-semibold">Criada em</TableHead>
                <TableHead className="w-24 text-right font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {propostasFiltradas.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono font-semibold text-primary text-xs">
                    {p.numero || '—'}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-foreground">
                    {p.cliente || '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`${statusColors[p.status] || ''} text-xs`}>
                      {statusLabels[p.status] || p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatBRL(p.valor_total)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.created ? new Date(p.created).toLocaleDateString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/propostas/${p.id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Abrir">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive/70 hover:text-destructive"
                        disabled={isDeleting === p.id}
                        onClick={() => handleDelete(p.id, p.numero)}
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Modal Nova Proposta */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Proposta de Venda</DialogTitle>
            <DialogDescription>
              Selecione um ou mais SKUs, informe a quantidade de cada um e o valor será calculado
              com o preço de venda atual da precificação.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cliente">Cliente *</Label>
              <Input
                id="cliente"
                placeholder="Nome do cliente"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="obs">Observações</Label>
              <Input
                id="obs"
                placeholder="Observações da proposta (opcional)"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>

            <div className="border border-border rounded-lg divide-y divide-border">
              {boms.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  Nenhum SKU cadastrado. Crie um BOM primeiro.
                </p>
              ) : (
                boms.map((bom) => {
                  const qtd = selecoes[bom.id] || 0
                  const items = bomItemsCache[bom.id] || []
                  const custo = items.reduce(
                    (a: number, it: any) =>
                      a + (Number(it.quantidade) || 0) * (Number(it.custo_unitario) || 0),
                    0,
                  )
                  // Mesmo helper do snapshot gravado na criação (markup divisor com
                  // TODOS os percentuais da tabela + override de overhead/margem do SKU).
                  const precoVenda = calcularMarkupDivisor(
                    custo,
                    montarPercentuais(pMap, {
                      overhead: bom.overhead_percentual,
                      margem: bom.margem_percentual,
                    }),
                  ).precoVenda
                  return (
                    <div
                      key={bom.id}
                      className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs font-bold text-primary block truncate">
                          {bom.sku}
                        </span>
                        <span className="text-xs text-foreground block truncate">{bom.nome}</span>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        {formatBRL(precoVenda)}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        value={qtd || ''}
                        placeholder="Qtd"
                        onChange={(e) =>
                          setSelecoes((prev) => ({
                            ...prev,
                            [bom.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                          }))
                        }
                        className="w-20 h-8 text-center font-mono text-xs shrink-0"
                      />
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border">
              <span className="text-sm font-semibold text-foreground">
                Valor Total da Proposta:
              </span>
              <span className="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {formatBRL(valorTotalSelecao)}
              </span>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Criando...' : 'Criar Proposta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
