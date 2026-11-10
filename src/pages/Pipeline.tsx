import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { propostasService } from '@/services/propostas'
import { clientesService } from '@/services/clientes'
import { usuariosService } from '@/services/usuarios'
import { ordensCompraService } from '@/services/ordensCompra'
import type { Proposta, PropostaStatus, Cliente, UsuarioPerfil } from '@/types/erp'
import { formatBRL } from '@/utils/formatters'
import { PipelineCard } from '@/components/pipeline/PipelineCard'
import { PipelineMetrics, type VendedorStats } from '@/components/pipeline/PipelineMetrics'
import { PipelineFiltersBar } from '@/components/pipeline/PipelineFiltersBar'
import { MotivoPerdaDialog } from '@/components/pipeline/MotivoPerdaDialog'
import { RecusarDescontoDialog } from '@/components/propostas/RecusarDescontoDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Kanban, Plus, RotateCw, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'

export interface PipelineColumnDef {
  status: PropostaStatus
  title: string
  color: string
  bgColor: string
  borderColor: string
  badgeColor: string
}

export const PIPELINE_COLUMNS: PipelineColumnDef[] = [
  {
    status: 'rascunho',
    title: 'Rascunho',
    color: 'text-slate-700 dark:text-slate-300',
    bgColor: 'bg-slate-50 dark:bg-slate-900/30',
    borderColor: 'border-slate-200 dark:border-slate-800',
    badgeColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  {
    status: 'aguardando_aprovacao',
    title: 'Aguardando Aprovação',
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-50/60 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-900/50',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  },
  {
    status: 'enviada',
    title: 'Enviada',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-50/60 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-900/50',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  },
  {
    status: 'em_negociacao',
    title: 'Em negociação',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-50/60 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-900/50',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  {
    status: 'vendida',
    title: 'Vendida',
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-50/60 dark:bg-emerald-950/20',
    borderColor: 'border-emerald-200 dark:border-emerald-900/50',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  {
    status: 'perdida',
    title: 'Perdida',
    color: 'text-rose-700 dark:text-rose-300',
    bgColor: 'bg-rose-50/60 dark:bg-rose-950/20',
    borderColor: 'border-rose-200 dark:border-rose-900/50',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
]

export default function PipelinePage() {
  const { user, isAdmin, isVendedor } = useAuth()

  // Dados carregados do backend
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioPerfil[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filtros
  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos')
  const [filtroCliente, setFiltroCliente] = useState<string>('todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('todos')
  const [dataInicio, setDataInicio] = useState<string>('')
  const [dataFim, setDataFim] = useState<string>('')
  const [termoBusca, setTermoBusca] = useState<string>('')

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<PropostaStatus | null>(null)

  // Diálogo de perda
  const [motivoModalOpen, setMotivoModalOpen] = useState(false)
  const [propostaPerdidaAlvo, setPropostaPerdidaAlvo] = useState<Proposta | null>(null)
  const [motivoTexto, setMotivoTexto] = useState('')
  const [isSubmittingPerda, setIsSubmittingPerda] = useState(false)

  // Diálogo de recusa de desconto (admin)
  const [recusarModalOpen, setRecusarModalOpen] = useState(false)
  const [propostaRecusaAlvo, setPropostaRecusaAlvo] = useState<Proposta | null>(null)
  const [isSubmittingRecusa, setIsSubmittingRecusa] = useState(false)

  // Carrega propostas, clientes e (se admin) usuários/vendedores
  const carregarDados = async () => {
    setIsLoading(true)
    try {
      const propostasPromise = propostasService.getAll()
      const clientesPromise = clientesService.getAll().catch(() => [] as Cliente[])
      const usuariosPromise = isAdmin
        ? usuariosService.getAll().catch(() => [] as UsuarioPerfil[])
        : Promise.resolve([] as UsuarioPerfil[])

      const [pList, cList, uList] = await Promise.all([
        propostasPromise,
        clientesPromise,
        usuariosPromise,
      ])

      // Vendedor só vê suas próprias propostas (já protegido por RLS e reforçado localmente)
      const filtradas =
        isVendedor && user?.id ? pList.filter((p) => !p.criador || p.criador === user.id) : pList

      setPropostas(filtradas)
      setClientes(cList)
      setUsuarios(uList)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar dados do pipeline.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [isVendedor, isAdmin, user?.id])

  // Lista de vendedores para o select de filtro
  const listaVendedores = useMemo(() => {
    if (isAdmin && usuarios.length > 0) {
      return usuarios.filter((u) => u.perfil === 'vendedor' || u.perfil === 'admin')
    }
    const mapa = new Map<string, string>()
    for (const p of propostas) {
      if (p.criador) {
        const nome = p.expand?.criador?.name || p.expand?.criador?.email || 'Vendedor'
        mapa.set(p.criador, nome)
      }
    }
    return Array.from(mapa.entries()).map(([id, nome]) => ({
      id,
      user: id,
      nome,
      email: '',
      perfil: 'vendedor' as const,
      status: 'aprovado' as const,
    }))
  }, [isAdmin, usuarios, propostas])

  // Aplicação dos filtros sobre as propostas
  const propostasFiltradas = useMemo(() => {
    const agora = new Date()
    const inicioMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1)
    const inicio30Dias = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000)
    const inicio90Dias = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000)

    return propostas.filter((p) => {
      // 1. Filtro Vendedor (admin)
      if (filtroVendedor !== 'todos') {
        if (p.criador !== filtroVendedor) return false
      }

      // 2. Filtro Cliente
      if (filtroCliente !== 'todos') {
        if (p.cliente.toLowerCase() !== filtroCliente.toLowerCase()) return false
      }

      // 3. Filtro Período
      if (p.created) {
        const d = new Date(p.created)
        if (filtroPeriodo === 'mes_atual') {
          if (d < inicioMesAtual) return false
        } else if (filtroPeriodo === 'ultimos_30') {
          if (d < inicio30Dias) return false
        } else if (filtroPeriodo === 'ultimos_90') {
          if (d < inicio90Dias) return false
        } else if (filtroPeriodo === 'custom') {
          if (dataInicio && d < new Date(dataInicio + 'T00:00:00')) return false
          if (dataFim && d > new Date(dataFim + 'T23:59:59')) return false
        }
      }

      // 4. Termo de busca textual
      if (termoBusca.trim()) {
        const t = termoBusca.toLowerCase()
        const matchNum = p.numero?.toLowerCase().includes(t)
        const matchCli = p.cliente?.toLowerCase().includes(t)
        const matchMotivo = p.motivo_perda?.toLowerCase().includes(t)
        if (!matchNum && !matchCli && !matchMotivo) return false
      }

      return true
    })
  }, [propostas, filtroVendedor, filtroCliente, filtroPeriodo, dataInicio, dataFim, termoBusca])

  // Cálculo de Métricas
  const metricas = useMemo(() => {
    const agora = new Date()
    const mesAtual = agora.getMonth()
    const anoAtual = agora.getFullYear()

    const basePropostas = propostasFiltradas

    let totalProposto = 0
    let totalVendidoMes = 0
    let qtdVendidasMes = 0
    let qtdVendidasTotal = 0
    let qtdPerdidasTotal = 0

    for (const p of basePropostas) {
      const v = Number(p.valor_total) || 0

      // Propostas no pipeline ativo
      if (p.status === 'rascunho' || p.status === 'enviada' || p.status === 'em_negociacao') {
        totalProposto += v
      }

      if (p.status === 'vendida') {
        qtdVendidasTotal += 1
        const dt = p.updated || p.created
        if (dt) {
          const d = new Date(dt)
          if (d.getMonth() === mesAtual && d.getFullYear() === anoAtual) {
            totalVendidoMes += v
            qtdVendidasMes += 1
          }
        } else {
          totalVendidoMes += v
          qtdVendidasMes += 1
        }
      } else if (p.status === 'perdida') {
        qtdPerdidasTotal += 1
      }
    }

    const totalConcluidas = qtdVendidasTotal + qtdPerdidasTotal
    const taxaConversao =
      totalConcluidas > 0
        ? (qtdVendidasTotal / totalConcluidas) * 100
        : basePropostas.length > 0
          ? (qtdVendidasTotal / basePropostas.length) * 100
          : 0

    // Consolidado por Vendedor (apenas quando visualizado por admin)
    const vendedoresMap = new Map<
      string,
      {
        id: string
        nome: string
        totalProposto: number
        totalVendidoMes: number
        qtdPropostas: number
        qtdVendidasMes: number
        qtdVendidasTotal: number
        qtdPerdidasTotal: number
      }
    >()

    if (isAdmin) {
      for (const p of propostas) {
        const criadorId = p.criador || 'sistema'
        const criadorNome =
          p.expand?.criador?.name ||
          p.expand?.criador?.email ||
          (p.criador ? 'Vendedor' : 'Sistema')
        if (!vendedoresMap.has(criadorId)) {
          vendedoresMap.set(criadorId, {
            id: criadorId,
            nome: criadorNome,
            totalProposto: 0,
            totalVendidoMes: 0,
            qtdPropostas: 0,
            qtdVendidasMes: 0,
            qtdVendidasTotal: 0,
            qtdPerdidasTotal: 0,
          })
        }
        const stat = vendedoresMap.get(criadorId)!
        const v = Number(p.valor_total) || 0
        stat.qtdPropostas += 1

        if (
          p.status === 'rascunho' ||
          p.status === 'enviada' ||
          p.status === 'em_negociacao' ||
          p.status === 'aguardando_aprovacao'
        ) {
          stat.totalProposto += v
        }

        if (p.status === 'vendida') {
          stat.qtdVendidasTotal += 1
          const dt = p.updated || p.created
          if (dt) {
            const d = new Date(dt)
            if (d.getMonth() === mesAtual && d.getFullYear() === anoAtual) {
              stat.totalVendidoMes += v
              stat.qtdVendidasMes += 1
            }
          } else {
            stat.totalVendidoMes += v
            stat.qtdVendidasMes += 1
          }
        } else if (p.status === 'perdida') {
          stat.qtdPerdidasTotal += 1
        }
      }
    }

    const vendedoresStats: VendedorStats[] = Array.from(vendedoresMap.values()).map((vs) => {
      const conc = vs.qtdVendidasTotal + vs.qtdPerdidasTotal
      const conv =
        conc > 0
          ? (vs.qtdVendidasTotal / conc) * 100
          : vs.qtdPropostas > 0
            ? (vs.qtdVendidasTotal / vs.qtdPropostas) * 100
            : 0
      return {
        id: vs.id,
        nome: vs.nome,
        totalProposto: vs.totalProposto,
        totalVendidoMes: vs.totalVendidoMes,
        qtdPropostas: vs.qtdPropostas,
        qtdVendidasMes: vs.qtdVendidasMes,
        qtdFinalizadas: conc,
        taxaConversao: conv,
      }
    })

    return {
      totalProposto,
      totalVendidoMes,
      taxaConversao,
      qtdPropostas: basePropostas.filter((p) => p.status !== 'vendida' && p.status !== 'perdida')
        .length,
      qtdVendidasMes,
      vendedoresStats,
    }
  }, [propostasFiltradas, propostas, isAdmin])

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedId(id)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, colStatus: PropostaStatus) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverCol !== colStatus) {
      setDragOverCol(colStatus)
    }
  }

  const handleDragLeave = (colStatus: PropostaStatus) => {
    if (dragOverCol === colStatus) {
      setDragOverCol(null)
    }
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetStatus: PropostaStatus) => {
    e.preventDefault()
    setDragOverCol(null)
    const id = e.dataTransfer.getData('text/plain') || draggedId
    setDraggedId(null)
    if (!id) return

    const proposta = propostas.find((p) => p.id === id)
    if (!proposta || proposta.status === targetStatus) return

    // Vendedor não pode mover propostas que estão aguardando aprovação
    if (isVendedor && proposta.status === 'aguardando_aprovacao') {
      toast.warning('Esta proposta está aguardando aprovação do administrador.')
      return
    }

    // Apenas admin pode liberar proposta em aguardando_aprovacao
    if (proposta.status === 'aguardando_aprovacao' && !isAdmin) {
      toast.error('Apenas administradores podem liberar propostas com desconto excedente.')
      return
    }

    solicitarTransicaoStatus(proposta, targetStatus)
  }

  // Transições de status
  const solicitarTransicaoStatus = (proposta: Proposta, novoStatus: PropostaStatus) => {
    if (novoStatus === 'perdida') {
      setPropostaPerdidaAlvo(proposta)
      setMotivoTexto(proposta.motivo_perda || '')
      setMotivoModalOpen(true)
    } else {
      executarTransicaoStatus(proposta, novoStatus)
    }
  }

  const executarTransicaoStatus = async (
    proposta: Proposta,
    novoStatus: PropostaStatus,
    motivoPerda?: string,
  ) => {
    const statusAnterior = proposta.status
    const motivoAnterior = proposta.motivo_perda

    setPropostas((prev) =>
      prev.map((p) =>
        p.id === proposta.id
          ? {
              ...p,
              status: novoStatus,
              motivo_perda: novoStatus === 'perdida' ? motivoPerda : p.motivo_perda,
            }
          : p,
      ),
    )

    try {
      await propostasService.updateStatus(proposta.id, novoStatus, motivoPerda)

      if (novoStatus === 'vendida' && statusAnterior !== 'vendida') {
        try {
          await ordensCompraService.gerarOrdemParaPropostaVendida()
          toast.success('Proposta vendida! Ordem de compra sincronizada.')
        } catch (e) {
          toast.success('Proposta marcada como Vendida.')
        }
      } else if (novoStatus === 'perdida') {
        toast.info('Proposta arquivada como Perdida.')
      } else {
        const colDef = PIPELINE_COLUMNS.find((c) => c.status === novoStatus)
        toast.success(`Proposta movida para ${colDef?.title || novoStatus}.`)
      }
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao atualizar status da proposta no servidor.')
      setPropostas((prev) =>
        prev.map((p) =>
          p.id === proposta.id ? { ...p, status: statusAnterior, motivo_perda: motivoAnterior } : p,
        ),
      )
    }
  }

  const handleConfirmarPerda = async () => {
    if (!propostaPerdidaAlvo) return
    if (!motivoTexto.trim()) {
      toast.error('Por favor, informe o motivo da perda.')
      return
    }

    setIsSubmittingPerda(true)
    try {
      await executarTransicaoStatus(propostaPerdidaAlvo, 'perdida', motivoTexto.trim())
      setMotivoModalOpen(false)
      setPropostaPerdidaAlvo(null)
      setMotivoTexto('')
    } finally {
      setIsSubmittingPerda(false)
    }
  }

  // Aprovação e recusa de desconto direto no Pipeline (Admin)
  const handleAprovarDescontoPipeline = async (prop: Proposta) => {
    if (!isAdmin) return
    try {
      const atualizada = await propostasService.aprovarDesconto(prop.id)
      setPropostas((prev) => prev.map((p) => (p.id === prop.id ? atualizada : p)))
      toast.success(
        `Desconto da proposta ${prop.numero || ''} aprovado! Status restaurado para "${atualizada.status}".`,
      )
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao aprovar proposta.')
    }
  }

  const handleAbrirRecusarDescontoPipeline = (prop: Proposta) => {
    setPropostaRecusaAlvo(prop)
    setRecusarModalOpen(true)
  }

  const handleConfirmarRecusaPipeline = async (motivo: string) => {
    if (!propostaRecusaAlvo || !isAdmin) return
    setIsSubmittingRecusa(true)
    try {
      const atualizada = await propostasService.recusarDesconto(propostaRecusaAlvo.id, motivo)
      setPropostas((prev) => prev.map((p) => (p.id === propostaRecusaAlvo.id ? atualizada : p)))
      setRecusarModalOpen(false)
      setPropostaRecusaAlvo(null)
      toast.info(`Desconto da proposta ${propostaRecusaAlvo.numero || ''} recusado e zerado.`)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao recusar desconto.')
    } finally {
      setIsSubmittingRecusa(false)
    }
  }

  const limparFiltros = () => {
    setFiltroVendedor('todos')
    setFiltroCliente('todos')
    setFiltroPeriodo('todos')
    setDataInicio('')
    setDataFim('')
    setTermoBusca('')
  }

  const hasFiltrosAtivos =
    filtroVendedor !== 'todos' ||
    filtroCliente !== 'todos' ||
    filtroPeriodo !== 'todos' ||
    Boolean(termoBusca.trim())

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Kanban className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Pipeline Comercial
            </h1>
            <Badge variant="outline" className="text-xs font-mono ml-1">
              Kanban
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão visual do funil de vendas — arraste os cartões entre as colunas para atualizar o
            status
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/propostas">
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Ver em Lista
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={carregarDados}
            disabled={isLoading}
            className="gap-1.5 text-xs"
            title="Recarregar dados"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {!isVendedor && (
            <Link to="/propostas">
              <Button size="sm" className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Nova Proposta
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Painel do Vendedor / Métricas Consolidadas */}
      <PipelineMetrics
        isAdmin={isAdmin}
        isVendedor={isVendedor}
        currentUserName={user?.name || user?.email}
        totalProposto={metricas.totalProposto}
        totalVendidoMes={metricas.totalVendidoMes}
        taxaConversao={metricas.taxaConversao}
        qtdPropostas={metricas.qtdPropostas}
        qtdVendidasMes={metricas.qtdVendidasMes}
        vendedoresStats={metricas.vendedoresStats}
      />

      {/* Barra de Filtros */}
      <PipelineFiltersBar
        isAdmin={isAdmin}
        currentUserName={user?.name || user?.email}
        listaVendedores={listaVendedores}
        clientes={clientes}
        filtroVendedor={filtroVendedor}
        filtroCliente={filtroCliente}
        filtroPeriodo={filtroPeriodo}
        dataInicio={dataInicio}
        dataFim={dataFim}
        termoBusca={termoBusca}
        hasFiltrosAtivos={hasFiltrosAtivos}
        onSetFiltroVendedor={setFiltroVendedor}
        onSetFiltroCliente={setFiltroCliente}
        onSetFiltroPeriodo={setFiltroPeriodo}
        onSetDataInicio={setDataInicio}
        onSetDataFim={setDataFim}
        onSetTermoBusca={setTermoBusca}
        onLimparFiltros={limparFiltros}
      />

      {/* Kanban Board */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          Carregando pipeline comercial...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start">
          {PIPELINE_COLUMNS.map((col) => {
            const colPropostas = propostasFiltradas.filter((p) => p.status === col.status)
            const valorTotalCol = colPropostas.reduce((a, b) => a + (Number(b.valor_total) || 0), 0)
            const isDropTarget = dragOverCol === col.status

            return (
              <div
                key={col.status}
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDragLeave={() => handleDragLeave(col.status)}
                onDrop={(e) => handleDrop(e, col.status)}
                className={`rounded-xl border ${col.borderColor} ${col.bgColor} flex flex-col transition-all min-h-[480px] ${
                  isDropTarget ? 'ring-2 ring-primary ring-offset-2 scale-[1.01] bg-primary/5' : ''
                }`}
              >
                {/* Header da Coluna */}
                <div className="p-3 border-b border-border/40 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>
                      {col.title}
                    </span>
                    <Badge
                      className={`text-[10px] font-bold px-1.5 py-0 h-4 ${col.badgeColor} border-0`}
                    >
                      {colPropostas.length}
                    </Badge>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-muted-foreground">
                    {formatBRL(valorTotalCol)}
                  </span>
                </div>

                {/* Lista de Cards da Coluna */}
                <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-320px)]">
                  {colPropostas.length === 0 ? (
                    <div
                      className={`h-28 rounded-lg border border-dashed border-border/80 flex flex-col items-center justify-center p-3 text-center transition-colors ${
                        isDropTarget ? 'bg-primary/10 border-primary' : 'bg-background/40'
                      }`}
                    >
                      <p className="text-[11px] text-muted-foreground">
                        {isDropTarget ? 'Solte aqui para mover' : 'Nenhuma proposta nesta etapa'}
                      </p>
                    </div>
                  ) : (
                    colPropostas.map((prop) => (
                      <PipelineCard
                        key={prop.id}
                        proposta={prop}
                        isVendedor={isVendedor}
                        isAdmin={isAdmin}
                        onAprovarDesconto={handleAprovarDescontoPipeline}
                        onRecusarDesconto={handleAbrirRecusarDescontoPipeline}
                        onDragStart={handleDragStart}
                        onMoveToStatus={solicitarTransicaoStatus}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Diálogo de Motivo da Perda */}
      <MotivoPerdaDialog
        open={motivoModalOpen}
        propostaNumero={propostaPerdidaAlvo?.numero}
        cliente={propostaPerdidaAlvo?.cliente}
        motivo={motivoTexto}
        isSubmitting={isSubmittingPerda}
        onChangeMotivo={setMotivoTexto}
        onConfirm={handleConfirmarPerda}
        onCancel={() => {
          setMotivoModalOpen(false)
          setPropostaPerdidaAlvo(null)
          setMotivoTexto('')
        }}
      />

      {/* Diálogo de Recusa de Desconto (Admin) */}
      <RecusarDescontoDialog
        open={recusarModalOpen}
        onOpenChange={(open) => {
          setRecusarModalOpen(open)
          if (!open) setPropostaRecusaAlvo(null)
        }}
        propostaNumero={propostaRecusaAlvo?.numero}
        onConfirm={handleConfirmarRecusaPipeline}
        isSubmitting={isSubmittingRecusa}
      />
    </div>
  )
}
