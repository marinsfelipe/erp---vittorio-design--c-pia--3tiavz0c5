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
  FileSignature,
  Receipt,
  PlusCircle,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { MotivoPerdaDialog } from '@/components/pipeline/MotivoPerdaDialog'
import { GerarContratoDialog } from '@/components/contratos/GerarContratoDialog'
import { AdicionarProdutoAvulsoDialog } from '@/components/propostas/AdicionarProdutoAvulsoDialog'
import { faturamentosService } from '@/services/faturamentos'
import { clientesService } from '@/services/clientes'
import { parametrosService } from '@/services/parametros'
import { auditoriaDescontosService } from '@/services/auditoriaDescontos'
import type { FaturamentoItemProduto, DescontoTipo, PropostaDescontoAuditoria } from '@/types/erp'
import { calcularTotaisProposta } from '@/utils/descontos'
import { AplicarDescontoItemDialog } from '@/components/propostas/AplicarDescontoItemDialog'
import { AplicarDescontoGeralDialog } from '@/components/propostas/AplicarDescontoGeralDialog'
import { ResumoTotaisPropostaCard } from '@/components/propostas/ResumoTotaisPropostaCard'
import { HistoricoAuditoriaDescontos } from '@/components/propostas/HistoricoAuditoriaDescontos'
import { RecusarDescontoDialog } from '@/components/propostas/RecusarDescontoDialog'
import { ShieldAlert, ShieldCheck } from 'lucide-react'

const fluxo: PropostaStatus[] = ['rascunho', 'enviada', 'em_negociacao', 'vendida']
const statusLabels: Record<PropostaStatus, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando aprovação',
  enviada: 'Enviada',
  em_negociacao: 'Em negociação',
  vendida: 'Vendida',
  perdida: 'Perdida',
}

export default function PropostaDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isVendedor, isAdmin, user } = useAuth()
  const [proposta, setProposta] = useState<Proposta | null>(null)
  const [itens, setItens] = useState<PropostaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Descontos e Auditoria
  const [limiteVendedor, setLimiteVendedor] = useState<number>(10)
  const [auditorias, setAuditorias] = useState<PropostaDescontoAuditoria[]>([])
  const [loadingAuditoria, setLoadingAuditoria] = useState(false)
  const [descontoItemModalOpen, setDescontoItemModalOpen] = useState(false)
  const [itemSelecionadoDesconto, setItemSelecionadoDesconto] = useState<PropostaItem | null>(null)
  const [descontoGeralModalOpen, setDescontoGeralModalOpen] = useState(false)
  const [recusarDescontoModalOpen, setRecusarDescontoModalOpen] = useState(false)
  const [isSubmittingDesconto, setIsSubmittingDesconto] = useState(false)

  // Diálogo para marcar como perdida e gerar contrato
  const [motivoModalOpen, setMotivoModalOpen] = useState(false)
  const [motivoTexto, setMotivoTexto] = useState('')
  const [gerarContratoOpen, setGerarContratoOpen] = useState(false)
  const [gerandoFaturamento, setGerandoFaturamento] = useState(false)
  const [produtoAvulsoOpen, setProdutoAvulsoOpen] = useState(false)

  const carregarAuditorias = async (propId: string) => {
    if (!isAdmin) return
    setLoadingAuditoria(true)
    try {
      const logs = await auditoriaDescontosService.getByProposta(propId)
      setAuditorias(logs)
    } catch (err) {
      console.error('Erro ao buscar auditoria de descontos:', err)
    } finally {
      setLoadingAuditoria(false)
    }
  }

  const load = async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const [p, its, limite] = await Promise.all([
        propostasService.getById(id),
        propostasService.getItems(id),
        parametrosService.getLimiteDescontoVendedor().catch(() => 10),
      ])
      setProposta(p)
      setItens(its)
      setLimiteVendedor(limite)
      if (isAdmin) {
        carregarAuditorias(p.id)
      }
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
  }, [id, isAdmin])

  // Handlers de aplicação de descontos
  const handleAbrirDescontoItem = (item: PropostaItem) => {
    setItemSelecionadoDesconto(item)
    setDescontoItemModalOpen(true)
  }

  const handleConfirmarDescontoItem = async (tipo: DescontoTipo, valor: number) => {
    if (!proposta || !itemSelecionadoDesconto) return
    setIsSubmittingDesconto(true)
    try {
      const resultado = await propostasService.aplicarDescontoItem({
        propostaId: proposta.id,
        itemId: itemSelecionadoDesconto.id,
        descontoTipo: tipo,
        descontoValor: valor,
        isVendedor,
        userPerfil: user?.perfil,
      })

      setProposta(resultado.proposta)
      setItens((prev) => prev.map((i) => (i.id === resultado.item.id ? resultado.item : i)))
      setDescontoItemModalOpen(false)
      setItemSelecionadoDesconto(null)

      if (resultado.proposta.status === 'aguardando_aprovacao') {
        toast.warning(
          `Desconto aplicado! Acima do limite (${limiteVendedor}%), a proposta requer aprovação do administrador.`,
        )
      } else {
        toast.success('Desconto no item aplicado com sucesso!')
      }

      if (isAdmin) {
        carregarAuditorias(proposta.id)
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao aplicar desconto no item.')
    } finally {
      setIsSubmittingDesconto(false)
    }
  }

  const handleConfirmarDescontoGeral = async (tipo: DescontoTipo, valor: number) => {
    if (!proposta) return
    setIsSubmittingDesconto(true)
    try {
      const resultado = await propostasService.aplicarDescontoGeral({
        propostaId: proposta.id,
        descontoTipo: tipo,
        descontoValor: valor,
        isVendedor,
        userPerfil: user?.perfil,
      })

      setProposta(resultado.proposta)
      setDescontoGeralModalOpen(false)

      if (resultado.proposta.status === 'aguardando_aprovacao') {
        toast.warning(
          `Desconto geral aplicado! Acima do limite (${limiteVendedor}%), a proposta requer liberação do administrador.`,
        )
      } else {
        toast.success('Desconto geral aplicado com sucesso!')
      }

      if (isAdmin) {
        carregarAuditorias(proposta.id)
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao aplicar desconto geral.')
    } finally {
      setIsSubmittingDesconto(false)
    }
  }

  // Aprovação / Recusa pelo Administrador
  const handleAprovarDesconto = async () => {
    if (!proposta || !isAdmin) return
    setIsSaving(true)
    try {
      const liberada = await propostasService.aprovarDesconto(proposta.id)
      setProposta(liberada)
      toast.success(
        `Desconto aprovado pelo administrador! Proposta retornou para ${statusLabels[liberada.status]}.`,
      )
      carregarAuditorias(proposta.id)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao aprovar proposta.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRecusarDesconto = async (motivo: string) => {
    if (!proposta || !isAdmin) return
    setIsSaving(true)
    try {
      const recusada = await propostasService.recusarDesconto(proposta.id, motivo)
      setProposta(recusada)
      setRecusarDescontoModalOpen(false)
      toast.info('Desconto reprovado e ajustado pelo administrador.')
      carregarAuditorias(proposta.id)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao recusar desconto da proposta.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleGerarFaturamento = async () => {
    if (!proposta) return
    setGerandoFaturamento(true)

    try {
      // 1. Verifica se já existe faturamento para esta proposta (evitar duplicidade)
      const existentes = await faturamentosService.getByProposta(proposta.id)
      if (existentes.length > 0) {
        const fatExistente = existentes[0]
        toast.info(
          `Já existe o faturamento ${fatExistente.numero} para esta proposta. Redirecionando...`,
        )
        navigate('/faturamentos')
        return
      }

      // 2. Busca dados cadastrais e fiscais do cliente
      let clienteEncontrado = null
      try {
        const todosClientes = await clientesService.getAll()
        const nomeAlvo = proposta.cliente.trim().toLowerCase()
        clienteEncontrado =
          todosClientes.find(
            (c) =>
              c.razao_social.trim().toLowerCase() === nomeAlvo ||
              (c.contato && c.contato.trim().toLowerCase() === nomeAlvo),
          ) || null
      } catch (errCliente) {
        console.warn('Erro ao associar cadastro do cliente para faturamento:', errCliente)
      }

      // 3. Monta itens a partir dos produtos da proposta usando preços líquidos
      const produtosFaturamento: FaturamentoItemProduto[] = itens.map((item) => {
        const precoLiquido =
          item.preco_liquido !== undefined && item.preco_liquido !== null
            ? item.preco_liquido
            : item.preco_unitario
        const subtotalLiquido = precoLiquido * item.quantidade

        return {
          descricao: item.nome_produto,
          sku: item.sku,
          quantidade: item.quantidade,
          valor_unitario: precoLiquido,
          valor_total: subtotalLiquido,
        }
      })

      // 4. Obtém o próximo número de faturamento
      const { numero, ano, sequencial } = await faturamentosService.getProximoNumero()

      // 5. Cria o registro de faturamento com o valor final líquido da proposta
      const novoFaturamento = await faturamentosService.create({
        numero,
        ano,
        sequencial,
        proposta: proposta.id,
        proposta_numero: proposta.numero,
        cliente: clienteEncontrado?.id,
        cliente_razao_social: clienteEncontrado?.razao_social || proposta.cliente,
        cliente_cnpj: clienteEncontrado?.cnpj || undefined,
        cliente_ie: undefined,
        cliente_endereco: clienteEncontrado?.endereco || undefined,
        cliente_cidade: clienteEncontrado?.cidade || undefined,
        cliente_uf: clienteEncontrado?.uf || undefined,
        cliente_contato: clienteEncontrado?.contato || undefined,
        cliente_email: clienteEncontrado?.email || undefined,
        cliente_telefone: clienteEncontrado?.telefone || undefined,
        produtos: produtosFaturamento,
        valor_total: Number(proposta.valor_total) || 0,
        status: 'pendente',
        observacoes: proposta.observacoes || undefined,
      })

      toast.success(`Faturamento ${novoFaturamento.numero} gerado com sucesso! Redirecionando...`)
      navigate('/faturamentos')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao gerar faturamento.')
    } finally {
      setGerandoFaturamento(false)
    }
  }

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

  const totaisCalculados = calcularTotaisProposta(
    itens,
    proposta.desconto_tipo,
    proposta.desconto_valor,
  )

  // Se proposta tiver valor_total salvo, usamos o total líquido calculado
  const valorTotalFinal = totaisCalculados.totalFinal
  const custoTotal = itens.reduce((a, i) => a + i.custo_unitario * i.quantidade, 0)
  const margemValor = valorTotalFinal - custoTotal

  const statusIcons: Record<PropostaStatus, React.ReactNode> = {
    rascunho: <Clock className="h-3.5 w-3.5" />,
    aguardando_aprovacao: <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />,
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
          {proposta.status === 'aguardando_aprovacao' && isAdmin && (
            <>
              <Button
                onClick={handleAprovarDesconto}
                disabled={isSaving}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <ShieldCheck className="h-4 w-4" />
                Aprovar Desconto
              </Button>
              <Button
                variant="outline"
                onClick={() => setRecusarDescontoModalOpen(true)}
                disabled={isSaving}
                className="gap-2 text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <ShieldAlert className="h-4 w-4" />
                Recusar Desconto
              </Button>
            </>
          )}
          {proposta.status === 'aguardando_aprovacao' && isVendedor && (
            <Badge className="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 px-3 py-1.5 text-xs font-semibold">
              <Clock className="h-3.5 w-3.5 mr-1 inline" />
              Aguardando liberação do Administrador
            </Badge>
          )}
          {proximo && proposta.status !== 'aguardando_aprovacao' && (
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
          {proposta.status === 'vendida' && (
            <Button
              onClick={() => setGerarContratoOpen(true)}
              variant="outline"
              className="gap-2 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              <FileSignature className="h-4 w-4" />
              Gerar Contrato
            </Button>
          )}
          {proposta.status === 'vendida' && (
            <Button
              onClick={handleGerarFaturamento}
              disabled={gerandoFaturamento}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Receipt className="h-4 w-4" />
              {gerandoFaturamento ? 'Gerando...' : 'Gerar Faturamento'}
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

      {/* Aviso de Aguardando Aprovação */}
      {proposta.status === 'aguardando_aprovacao' && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-amber-900 dark:text-amber-200">
                Proposta Aguardando Aprovação do Administrador
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                O desconto aplicado nesta proposta superou o limite permitido para vendedores (
                {limiteVendedor}%). O fluxo comercial fica pausado até que um administrador aprove
                ou recuse o desconto.
              </p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={handleAprovarDesconto}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRecusarDescontoModalOpen(true)}
                disabled={isSaving}
                className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                Recusar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Fluxo de status */}
      <div className="flex items-center gap-2 flex-wrap">
        {fluxo.map((s, idx) => {
          const current = fluxo.indexOf(proposta.status)
          const done =
            idx <= current &&
            proposta.status !== 'perdida' &&
            proposta.status !== 'aguardando_aprovacao'
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
        {proposta.status === 'aguardando_aprovacao' && (
          <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-1">
            <Clock className="h-3 w-3" />
            Status Atual: Aguardando aprovação
          </Badge>
        )}
        {proposta.status === 'perdida' && (
          <Badge className="bg-rose-600 text-white font-semibold">Status Atual: Perdida</Badge>
        )}
        {proposta.status !== 'vendida' &&
          proposta.status !== 'perdida' &&
          proposta.status !== 'aguardando_aprovacao' && (
            <span className="text-xs text-muted-foreground ml-2">
              Avance o status nos botões acima ou arraste no Pipeline.
            </span>
          )}
      </div>

      {/* Métricas e Resumo Comercial com Descontos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div
            className={`grid grid-cols-1 ${isVendedor ? 'md:grid-cols-1' : 'md:grid-cols-3'} gap-4`}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Valor Total Líquido</CardDescription>
                <CardTitle className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                  {formatBRL(valorTotalFinal)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Total final com todos os descontos aplicados
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
                    Total final menos custo de materiais
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        {/* Card do Resumo de Totais e Descontos */}
        <div>
          <ResumoTotaisPropostaCard
            totais={totaisCalculados}
            proposta={proposta}
            onAbrirDescontoGeral={() => setDescontoGeralModalOpen(true)}
            disabled={proposta.status === 'vendida' || proposta.status === 'perdida'}
            isVendedor={isVendedor}
            limiteVendedor={limiteVendedor}
          />
        </div>
      </div>

      {/* Itens */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg font-bold">Produtos da Proposta</CardTitle>
            <CardDescription>Produtos normais e avulsos incluídos nesta proposta</CardDescription>
          </div>
          {proposta.status !== 'perdida' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProdutoAvulsoOpen(true)}
              className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
            >
              <PlusCircle className="h-4 w-4" />
              Adicionar produto avulso
            </Button>
          )}
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
                  <TableHead className="text-right font-semibold">Preço Tabela</TableHead>
                  <TableHead className="text-right font-semibold">Desconto</TableHead>
                  <TableHead className="text-right font-semibold">Preço Líquido</TableHead>
                  <TableHead className="text-right font-semibold">Subtotal Líquido</TableHead>
                  <TableHead className="text-center font-semibold w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((it) => {
                  const temDesconto = Number(it.desconto_valor) > 0
                  const precoLiquido =
                    it.preco_liquido !== undefined && it.preco_liquido !== null
                      ? it.preco_liquido
                      : it.preco_unitario
                  const subtotalLiquido = precoLiquido * it.quantidade

                  return (
                    <TableRow key={it.id} className="hover:bg-muted/30">
                      {' '}
                      <TableCell className="font-mono text-xs font-bold text-primary">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isVendedor || it.preco_direto ? (
                            <span>{it.sku}</span>
                          ) : (
                            <Link to={`/boms/${it.bom_id}`} className="hover:underline">
                              {it.sku}
                            </Link>
                          )}
                          {it.preco_direto && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 font-normal bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                            >
                              <Tag className="h-2.5 w-2.5 mr-0.5 inline" />
                              Preço Direto
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{it.nome_produto}</span>
                          {it.unidade && it.unidade !== 'UN' && (
                            <span className="text-xs text-muted-foreground">({it.unidade})</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {it.quantidade} {it.unidade || ''}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        <span className={temDesconto ? 'line-through text-xs' : ''}>
                          {formatBRL(it.preco_unitario)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {temDesconto ? (
                          <div className="text-rose-600 font-semibold">
                            {it.desconto_tipo === 'percentual'
                              ? `-${it.desconto_valor}%`
                              : `-${formatBRL(it.desconto_valor || 0)}`}
                            <div className="text-[10px] text-muted-foreground font-normal">
                              {it.desconto_tipo === 'percentual'
                                ? `(${formatBRL((it.preco_unitario * (it.desconto_valor || 0)) / 100)})`
                                : `(${(((it.desconto_valor || 0) / it.preco_unitario) * 100).toFixed(1)}%)`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatBRL(precoLiquido)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-sm text-foreground">
                        {formatBRL(subtotalLiquido)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAbrirDescontoItem(it)}
                          disabled={proposta.status === 'vendida' || proposta.status === 'perdida'}
                          className="h-8 px-2 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                          title="Aplicar ou alterar desconto deste item"
                        >
                          <Tag className="h-3.5 w-3.5" />
                          {temDesconto ? 'Editar' : 'Desconto'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
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

      {/* Histórico de Auditoria de Descontos (Visível Exclusivamente para Administrador) */}
      {isAdmin && (
        <HistoricoAuditoriaDescontos registros={auditorias} isLoading={loadingAuditoria} />
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

      <GerarContratoDialog
        open={gerarContratoOpen}
        onOpenChange={setGerarContratoOpen}
        proposta={proposta}
        itens={itens}
      />

      <AdicionarProdutoAvulsoDialog
        open={produtoAvulsoOpen}
        onOpenChange={setProdutoAvulsoOpen}
        propostaId={proposta.id}
        onSuccess={load}
      />

      {/* Modais de Desconto e Aprovação */}
      <AplicarDescontoItemDialog
        open={descontoItemModalOpen}
        onOpenChange={(open) => {
          setDescontoItemModalOpen(open)
          if (!open) setItemSelecionadoDesconto(null)
        }}
        item={itemSelecionadoDesconto}
        limiteVendedor={limiteVendedor}
        isVendedor={isVendedor}
        onConfirm={handleConfirmarDescontoItem}
        isSubmitting={isSubmittingDesconto}
      />

      <AplicarDescontoGeralDialog
        open={descontoGeralModalOpen}
        onOpenChange={setDescontoGeralModalOpen}
        proposta={proposta}
        itens={itens}
        onConfirm={handleConfirmarDescontoGeral}
        isSubmitting={isSubmittingDesconto}
        limiteVendedor={limiteVendedor}
        isVendedor={isVendedor}
      />

      <RecusarDescontoDialog
        open={recusarDescontoModalOpen}
        onOpenChange={setRecusarDescontoModalOpen}
        onConfirm={handleRecusarDesconto}
        isSubmitting={isSaving}
        propostaNumero={proposta.numero}
      />
    </div>
  )
}
