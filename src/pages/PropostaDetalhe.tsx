import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { propostasService } from '@/services/propostas'
import { ordensCompraService } from '@/services/ordensCompra'
import type { Proposta, PropostaItem, PropostaStatus } from '@/types/erp'
import { formatBRL } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
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
  ArrowLeft,
  FileText,
  ShoppingCart,
  CheckCircle2,
  Send,
  Award,
  Clock,
  XCircle,
  Plus,
  AlertCircle,
  Kanban,
} from 'lucide-react'
import { toast } from 'sonner'
import { MotivoPerdaDialog } from '@/components/pipeline/MotivoPerdaDialog'

const fluxo: PropostaStatus[] = ['rascunho', 'enviada', 'em_negociacao', 'vendida']
const statusLabels: Record<PropostaStatus, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  em_negociacao: 'Em negociação',
  vendida: 'Vendida',
  perdida: 'Perdida',
}

export default function PropostaDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isVendedor } = useAuth()
  const [proposta, setProposta] = useState<Proposta | null>(null)
  const [itens, setItens] = useState<PropostaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Diálogo para marcar como perdida
  const [motivoModalOpen, setMotivoModalOpen] = useState(false)
  const [motivoTexto, setMotivoTexto] = useState('')

  const load = async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const [p, its] = await Promise.all([
        propostasService.getById(id),
        propostasService.getItems(id),
      ])
      setProposta(p)
      setItens(its)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar proposta.')
      navigate('/propostas')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleAvancarStatus = async (statusDestino?: PropostaStatus) => {
    if (!proposta) return
    const idx = fluxo.indexOf(proposta.status)
    const novoStatus =
      statusDestino || (idx >= 0 && idx < fluxo.length - 1 ? fluxo[idx + 1] : undefined)
    if (!novoStatus) return

    setIsSaving(true)
    try {
      await propostasService.updateStatus(proposta.id, novoStatus)
      if (novoStatus === 'vendida') {
        // Disparo no cliente: gera ordem de compra agregada (módulo de compras)
        await ordensCompraService.gerarOrdemParaPropostaVendida()
        toast.success('Proposta marcada como Vendida! Ordem de compra gerada em Compras.')
      } else {
        toast.success(`Status atualizado para ${statusLabels[novoStatus]}.`)
      }
      load()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao atualizar status da proposta.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmarPerda = async () => {
    if (!proposta) return
    if (!motivoTexto.trim()) {
      toast.error('Informe o motivo da perda.')
      return
    }

    setIsSaving(true)
    try {
      await propostasService.updateStatus(proposta.id, 'perdida', motivoTexto.trim())
      toast.info('Proposta marcada como Perdida.')
      setMotivoModalOpen(false)
      load()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao atualizar status da proposta.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-16 text-muted-foreground">Carregando proposta...</div>
  }
  if (!proposta) {
    return <div className="text-center py-16 text-muted-foreground">Proposta não encontrada.</div>
  }

  const valorTotal = itens.reduce((a, i) => a + i.preco_unitario * i.quantidade, 0)
  const custoTotal = itens.reduce((a, i) => a + i.custo_unitario * i.quantidade, 0)
  const margemValor = valorTotal - custoTotal

  const statusIcons: Record<PropostaStatus, React.ReactNode> = {
    rascunho: <Clock className="h-3.5 w-3.5" />,
    enviada: <Send className="h-3.5 w-3.5" />,
    em_negociacao: <Clock className="h-3.5 w-3.5" />,
    vendida: <Award className="h-3.5 w-3.5" />,
    perdida: <XCircle className="h-3.5 w-3.5" />,
  }

  const proximo = fluxo.includes(proposta.status)
    ? fluxo[fluxo.indexOf(proposta.status) + 1]
    : undefined

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <Link to="/propostas">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Proposta {proposta.numero || '—'}
              </h1>
              <Badge className="bg-muted text-muted-foreground text-xs">
                {statusIcons[proposta.status]}
                {statusLabels[proposta.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Cliente: <span className="font-medium text-foreground">{proposta.cliente}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/pipeline">
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <Kanban className="h-3.5 w-3.5 text-primary" />
              Ver no Pipeline
            </Button>
          </Link>
          {proximo && (
            <Button
              onClick={() => handleAvancarStatus(proximo)}
              disabled={isSaving}
              className="gap-2"
            >
              {proximo === 'enviada' ? (
                <Send className="h-4 w-4" />
              ) : proximo === 'em_negociacao' ? (
                <Clock className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {isSaving
                ? 'Salvando...'
                : proximo === 'enviada'
                  ? 'Marcar como Enviada'
                  : proximo === 'em_negociacao'
                    ? 'Em Negociação'
                    : 'Marcar como Vendida'}
            </Button>
          )}
          {proposta.status !== 'perdida' && proposta.status !== 'vendida' && (
            <Button
              variant="outline"
              onClick={() => {
                setMotivoTexto(proposta.motivo_perda || '')
                setMotivoModalOpen(true)
              }}
              disabled={isSaving}
              className="gap-2 text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              <XCircle className="h-4 w-4" />
              Marcar como Perdida
            </Button>
          )}
          {proposta.status === 'vendida' && !isVendedor && (
            <Link to="/compras">
              <Button variant="outline" className="gap-2">
                <ShoppingCart className="h-4 w-4" />
                Ver Compras
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Motivo da Perda (se perdida) */}
      {proposta.status === 'perdida' && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <h4 className="font-semibold text-rose-900 dark:text-rose-200">
              Proposta Finalizada como Perdida
            </h4>
            <p className="text-rose-800 dark:text-rose-300">
              <span className="font-medium">Motivo registrado:</span>{' '}
              {proposta.motivo_perda || 'Nenhum motivo informado.'}
            </p>
          </div>
        </div>
      )}

      {/* Fluxo de status */}
      <div className="flex items-center gap-2 flex-wrap">
        {fluxo.map((s, idx) => {
          const current = fluxo.indexOf(proposta.status)
          const done = idx <= current && proposta.status !== 'perdida'
          return (
            <div key={s} className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  done
                    ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground'
                }
              >
                {idx + 1}. {statusLabels[s]}
              </Badge>
              {idx < fluxo.length - 1 && <span className="text-muted-foreground">→</span>}
            </div>
          )
        })}
        {proposta.status === 'perdida' && (
          <Badge className="bg-rose-600 text-white font-semibold">Status Atual: Perdida</Badge>
        )}
        {proposta.status !== 'vendida' && proposta.status !== 'perdida' && (
          <span className="text-xs text-muted-foreground ml-2">
            Avance o status nos botões acima ou arraste no Pipeline.
          </span>
        )}
      </div>

      {/* Métricas */}
      <div
        className={`grid grid-cols-1 ${
          isVendedor ? 'md:grid-cols-1 max-w-sm' : 'md:grid-cols-3'
        } gap-4`}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valor Total da Proposta</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 font-mono">
              {formatBRL(valorTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Preço de venda × quantidade de cada SKU
          </CardContent>
        </Card>
        {!isVendedor && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Custo dos Materiais (BOMs)</CardDescription>
                <CardTitle className="text-2xl font-bold font-mono">
                  {formatBRL(custoTotal)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Custo consolidado dos componentes dos SKUs
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Margem Bruta Estimada</CardDescription>
                <CardTitle className="text-2xl font-bold font-mono text-primary">
                  {formatBRL(margemValor)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Valor total menos custo de materiais
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Itens */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold">SKUs da Proposta</CardTitle>
          <CardDescription>Produtos (BOMs) incluídos nesta proposta</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum SKU nesta proposta.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="font-semibold">SKU</TableHead>
                  <TableHead className="font-semibold">Produto</TableHead>
                  <TableHead className="text-right font-semibold">Qtd</TableHead>
                  <TableHead className="text-right font-semibold">Preço Unit.</TableHead>
                  <TableHead className="text-right font-semibold">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((it) => (
                  <TableRow key={it.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-bold text-primary">
                      {isVendedor ? (
                        <span>{it.sku}</span>
                      ) : (
                        <Link to={`/boms/${it.bom_id}`} className="hover:underline">
                          {it.sku}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{it.nome_produto}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{it.quantidade}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatBRL(it.preco_unitario)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-sm">
                      {formatBRL(it.preco_unitario * it.quantidade)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Observações */}
      {proposta.observacoes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Observações</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {proposta.observacoes}
          </CardContent>
        </Card>
      )}

      {/* Modal para solicitar motivo da perda */}
      <MotivoPerdaDialog
        open={motivoModalOpen}
        onCancel={() => setMotivoModalOpen(false)}
        motivo={motivoTexto}
        onChangeMotivo={setMotivoTexto}
        onConfirm={handleConfirmarPerda}
        isSubmitting={isSaving}
        propostaNumero={proposta.numero}
        cliente={proposta.cliente}
      />
    </div>
  )
}
