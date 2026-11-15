import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { faturamentosService } from '@/services/faturamentos'
import { fiscalService, type RespostaFiscal } from '@/services/fiscal'
import type { Empresa, Faturamento, FaturamentoStatus } from '@/types/erp'
import { formatBRL, formatDateTime } from '@/utils/formatters'
import { exportarPreNotaXlsx, exportarListaFaturamentosXlsx } from '@/utils/faturamentoExport'
import { itensPendentesFiscais } from '@/utils/fiscalExportacao'
import DialogExportacaoPendencias from '@/components/fiscal/DialogExportacaoPendencias'
import { formatarCest } from '@/components/precos/CestCell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
  Receipt,
  Search,
  Eye,
  Save,
  Barcode,
  Route,
  Building2,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Mail,
  Phone,
  FileText,
  FileCheck2,
  AlertCircle,
  Calculator,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'

export default function FaturamentosPage() {
  const { isAdmin } = useAuth()
  const [faturamentos, setFaturamentos] = useState<Faturamento[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pendente' | 'emitido'>('todos')
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [alterandoStatusId, setAlterandoStatusId] = useState<string | null>(null)
  const [visualizandoFaturamento, setVisualizandoFaturamento] = useState<Faturamento | null>(null)
  // Fiscal F2 — CFOP/CEST (calculados pelo hook fiscal; só admin)
  const [fiscalDetalhe, setFiscalDetalhe] = useState<RespostaFiscal | null>(null)
  const [cfopEdicao, setCfopEdicao] = useState('')
  const [salvandoCfop, setSalvandoCfop] = useState(false)
  // Fiscal F3 — lançamento da NF emitida pelo contador (só admin)
  const [nfForm, setNfForm] = useState({
    nf_numero: '',
    nf_serie: '',
    nf_data_emissao: '',
    nf_valor: '',
  })
  const [salvandoNf, setSalvandoNf] = useState(false)
  // Fiscal F4 — exportação da pré-nota com bloqueio de pendências fiscais
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [pendenciasExport, setPendenciasExport] = useState<Faturamento | null>(null)

  // Ao abrir os detalhes (admin), busca CFOP/CEST/ST do hook fiscal (1 request).
  const abrirDetalhes = async (fat: Faturamento) => {
    setVisualizandoFaturamento(fat)
    if (!isAdmin) return
    setFiscalDetalhe(null)
    setCfopEdicao(fat.cfop || '')
    setNfForm({
      nf_numero: fat.nf_numero || '',
      nf_serie: fat.nf_serie || '',
      nf_data_emissao: fat.nf_data_emissao || '',
      nf_valor: fat.nf_valor ? String(fat.nf_valor) : '',
    })
    try {
      const res = await fiscalService.calcularImpostos(fat.id)
      setFiscalDetalhe(res)
      if (res.cfop) setCfopEdicao(res.cfop)
    } catch (err) {
      // Sem CFOP/impostos calculados — segue só com os dados cadastrados
      console.warn('Fiscal: falha ao buscar CFOP/impostos do faturamento:', err)
    }
  }

  // Fiscal F2 — grava o CFOP digitado pelo admin (validação de 4 dígitos).
  const salvarCfop = async () => {
    if (!visualizandoFaturamento) return
    const limpo = cfopEdicao.replace(/\D/g, '')
    if (limpo && limpo.length !== 4) {
      toast.error('O CFOP deve ter 4 dígitos (ex.: 5.102 ou 5102).')
      return
    }
    setSalvandoCfop(true)
    try {
      const atualizado = await faturamentosService.update(visualizandoFaturamento.id, {
        cfop: cfopEdicao.trim(),
      })
      setVisualizandoFaturamento(atualizado)
      setFaturamentos((prev) => prev.map((f) => (f.id === atualizado.id ? atualizado : f)))
      toast.success('CFOP salvo.')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao salvar o CFOP.')
    } finally {
      setSalvandoCfop(false)
    }
  }

  // Fiscal F2 — preenche o CEST sugerido em todos os itens de ST (1 clique).
  const aplicarCestSugerido = async () => {
    if (!visualizandoFaturamento || !fiscalDetalhe?.cest_sugerido || !isAdmin) return
    const stSku = new Set((fiscalDetalhe.st_itens || []).map((i) => i.sku))
    const produtos = (visualizandoFaturamento.produtos || []).map((p) => ({
      ...p,
      cest: stSku.has(p.sku || '') && !p.cest ? fiscalDetalhe.cest_sugerido : p.cest,
    }))
    setVisualizandoFaturamento({ ...visualizandoFaturamento, produtos })
    try {
      const atualizado = await faturamentosService.update(visualizandoFaturamento.id, { produtos })
      setVisualizandoFaturamento(atualizado)
      setFaturamentos((prev) => prev.map((f) => (f.id === atualizado.id ? atualizado : f)))
      toast.success(
        `CEST ${fiscalDetalhe.cest_sugerido} sugerido para os itens de substituição tributária. Confira com o contador.`,
      )
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao gravar o CEST sugerido.')
    }
  }

  // Fiscal F3 — lança/corrige os dados da NF emitida pelo contador e marca
  // o faturamento como "Emitido". Grava o número, série, data e valor da nota.
  const salvarNf = async () => {
    if (!visualizandoFaturamento || !isAdmin) return
    const numero = nfForm.nf_numero.trim()
    if (!numero) {
      toast.error('Informe o número da NF (use "Desfazer lançamento" para removê-la).')
      return
    }
    if (!nfForm.nf_data_emissao) {
      toast.error('Informe a data de emissão da NF.')
      return
    }
    const valor = Number(String(nfForm.nf_valor).replace(',', '.'))
    if (!isFinite(valor) || valor <= 0) {
      toast.error('Informe o valor total da NF emitida.')
      return
    }
    setSalvandoNf(true)
    try {
      const atualizado = await faturamentosService.lancarNf(visualizandoFaturamento.id, {
        nf_numero: numero,
        nf_serie: nfForm.nf_serie.trim(),
        nf_data_emissao: nfForm.nf_data_emissao,
        nf_valor: valor,
      })

      // Sem impostos calculados ainda: calcula agora (mesmo fluxo do toggle de status)
      let final = atualizado
      if (!atualizado.impostos_estimados) {
        try {
          const est = await fiscalService.calcularImpostos(atualizado.id)
          final = { ...atualizado, impostos_estimados: est.total, valor_liquido: est.liquido }
        } catch (errFiscal) {
          console.warn('Fiscal: cálculo de impostos falhou ao lançar NF:', errFiscal)
        }
      }

      setVisualizandoFaturamento(final)
      setNfForm({
        nf_numero: final.nf_numero || '',
        nf_serie: final.nf_serie || '',
        nf_data_emissao: final.nf_data_emissao || '',
        nf_valor: final.nf_valor ? String(final.nf_valor) : '',
      })
      setFaturamentos((prev) => prev.map((f) => (f.id === final.id ? final : f)))
      toast.success(
        `NF ${numero}${final.nf_serie ? '/' + final.nf_serie : ''} lançada — faturamento Emitido.`,
      )
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao lançar a NF emitida.')
    } finally {
      setSalvandoNf(false)
    }
  }

  // Fiscal F3 — desfaz o lançamento da NF (volta para Pendente, sem NF).
  const desfazerNf = async () => {
    if (!visualizandoFaturamento) return
    setSalvandoNf(true)
    try {
      const atualizado = await faturamentosService.desfazerNf(visualizandoFaturamento.id)
      setVisualizandoFaturamento(atualizado)
      setNfForm({ nf_numero: '', nf_serie: '', nf_data_emissao: '', nf_valor: '' })
      setFaturamentos((prev) => prev.map((f) => (f.id === atualizado.id ? atualizado : f)))
      toast.success(
        `Lançamento da NF removido — faturamento ${atualizado.numero} voltou para Pendente.`,
      )
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao desfazer o lançamento da NF.')
    } finally {
      setSalvandoNf(false)
    }
  }

  const load = async () => {
    setIsLoading(true)
    try {
      const data = await faturamentosService.getAll()
      setFaturamentos(data)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar lista de faturamentos.')
    } finally {
      setIsLoading(false)
    }
  }

  // Fiscal F4 — cadastro da Empresa (emissor da pré-nota; 1 registro,
  // admin-only por RLS — define CSOSN/CST nas abas da planilha). Carregada
  // para TODOS os usuários: quando o vendedor não tem acesso à coleção,
  // a exportação segue com o fallback (Simples Nacional).
  useEffect(() => {
    fiscalService
      .getEmpresa()
      .then(setEmpresa)
      .catch((err) => console.warn('Fiscal: falha ao carregar Empresa:', err))
  }, [isAdmin])

  useEffect(() => {
    load()
  }, [])

  const handleToggleStatus = async (fat: Faturamento) => {
    const novoStatus: FaturamentoStatus = fat.status === 'pendente' ? 'emitido' : 'pendente'
    setAlterandoStatusId(fat.id)
    try {
      let atualizado = await faturamentosService.updateStatus(fat.id, novoStatus)
      toast.success(
        novoStatus === 'emitido'
          ? `Faturamento ${fat.numero} marcado como Emitido!`
          : `Faturamento ${fat.numero} retornado para Pendente.`,
      )

      // Módulo Fiscal: ao EMITIR, o backend calcula os impostos estimados
      // conforme o regime da Empresa (hook fiscal.pb.js) e grava o snapshot.
      // Só para admin — vendedor não vê nem dispara impostos.
      if (novoStatus === 'emitido' && isAdmin) {
        try {
          const est = await fiscalService.calcularImpostos(fat.id)
          atualizado = {
            ...atualizado,
            impostos_estimados: est.total,
            valor_liquido: est.liquido,
            regime_tributario: (est.regime || '').toLowerCase().includes('simples')
              ? 'simples'
              : 'presumido',
          }
          toast.info('Impostos estimados calculados (estimativa — apuração oficial pelo contador).')
        } catch (errFiscal: any) {
          console.warn('Cálculo fiscal falhou:', errFiscal)
          toast.warning(
            'Faturamento emitido, mas o cálculo de impostos estimados falhou. Calcule na página Fiscal.',
          )
        }
      }

      setFaturamentos((prev) => prev.map((f) => (f.id === fat.id ? atualizado : f)))
      if (visualizandoFaturamento?.id === fat.id) {
        setVisualizandoFaturamento(atualizado)
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao alterar status do faturamento.')
    } finally {
      setAlterandoStatusId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este registro de faturamento?')) return
    setIsDeleting(id)
    try {
      await faturamentosService.delete(id)
      toast.success('Faturamento excluído com sucesso.')
      load()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir faturamento.')
    } finally {
      setIsDeleting(null)
    }
  }

  // Fiscal F4 — exportação da PRÉ-NOTA com todas as colunas fiscais.
  // Bloqueio: item sem NCM = pendência fiscal. Vendedor NÃO exporta de forma
  // alguma nessa condição; admin pode liberar no diálogo de confirmação.
  const handleExportarIndividual = (fat: Faturamento) => {
    const pendentes = itensPendentesFiscais(fat)
    if (pendentes.length > 0) {
      if (!isAdmin) {
        toast.error(
          'Exportação bloqueada: o faturamento tem item(s) pendente(s) fiscal(is) (sem NCM). ' +
            'Apenas um administrador pode liberar a exportação.',
        )
        return
      }
      setPendenciasExport(fat)
      return
    }
    executarExportacao(fat, false)
  }

  const executarExportacao = (fat: Faturamento, liberarPendencias: boolean) => {
    try {
      exportarPreNotaXlsx(fat, {
        empresa,
        liberarPendencias,
      })
      toast.success(`Planilha ${fat.numero} exportada com sucesso!`)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao gerar planilha .xlsx.')
    }
  }

  const handleExportarLista = () => {
    if (filtered.length === 0) {
      toast.error('Nenhum registro para exportar.')
      return
    }
    try {
      exportarListaFaturamentosXlsx(filtered)
      toast.success(`Exportados ${filtered.length} faturamento(s) para o escritório contábil!`)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao exportar lista.')
    }
  }

  const filtered = faturamentos.filter((fat) => {
    const q = searchTerm.toLowerCase()
    const matchesSearch =
      fat.numero.toLowerCase().includes(q) ||
      fat.cliente_razao_social.toLowerCase().includes(q) ||
      (fat.cliente_cnpj || '').toLowerCase().includes(q) ||
      (fat.proposta_numero || '').toLowerCase().includes(q) ||
      (fat.cliente_cidade || '').toLowerCase().includes(q)

    const matchesStatus = filtroStatus === 'todos' ? true : fat.status === filtroStatus

    return matchesSearch && matchesStatus
  })

  const totalGeral = filtered.reduce((acc, f) => acc + (f.valor_total || 0), 0)
  const pendentesCount = faturamentos.filter((f) => f.status === 'pendente').length
  const emitidosCount = faturamentos.filter((f) => f.status === 'emitido').length

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Faturamentos (Pré-Notas)
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              {faturamentos.length} registro(s)
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Organização dos dados fiscais e produtos para envio e emissão de NF no escritório
            contábil
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportarLista}
            disabled={filtered.length === 0}
            className="gap-2 text-xs border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Lista (.xlsx)
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card
          className={`cursor-pointer transition-colors ${
            filtroStatus === 'todos' ? 'border-primary ring-1 ring-primary/20' : ''
          }`}
          onClick={() => setFiltroStatus('todos')}
        >
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground font-medium">Total de Faturamentos</div>
            <div className="text-2xl font-bold font-mono mt-1 text-foreground">
              {faturamentos.length}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Valor consolidado:{' '}
              {formatBRL(faturamentos.reduce((a, f) => a + (f.valor_total || 0), 0))}
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors ${
            filtroStatus === 'pendente' ? 'border-amber-500 ring-1 ring-amber-500/20' : ''
          }`}
          onClick={() => setFiltroStatus('pendente')}
        >
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Pendentes de Emissão
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-amber-600 dark:text-amber-400">
              {pendentesCount}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Aguardando nota fiscal do escritório
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors ${
            filtroStatus === 'emitido' ? 'border-emerald-600 ring-1 ring-emerald-600/20' : ''
          }`}
          onClick={() => setFiltroStatus('emitido')}
        >
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Notas Fiscais Emitidas
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
              {emitidosCount}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Faturamentos concluídos</div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, cliente, CNPJ ou proposta..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30 text-xs">
            <button
              onClick={() => setFiltroStatus('todos')}
              className={`px-3 py-1 rounded-md transition-colors ${
                filtroStatus === 'todos'
                  ? 'bg-background font-semibold shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Todos ({faturamentos.length})
            </button>
            <button
              onClick={() => setFiltroStatus('pendente')}
              className={`px-3 py-1 rounded-md transition-colors ${
                filtroStatus === 'pendente'
                  ? 'bg-background font-semibold shadow-sm text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Pendentes ({pendentesCount})
            </button>
            <button
              onClick={() => setFiltroStatus('emitido')}
              className={`px-3 py-1 rounded-md transition-colors ${
                filtroStatus === 'emitido'
                  ? 'bg-background font-semibold shadow-sm text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Emitidos ({emitidosCount})
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de faturamentos */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Carregando lista de faturamentos...
            </p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Receipt className="h-10 w-10 text-muted-foreground mx-auto stroke-1" />
              <p className="text-sm font-medium text-foreground">Nenhum faturamento encontrado.</p>
              <p className="text-xs text-muted-foreground">
                Acesse uma Proposta Comercial com status "Vendida" e clique em "Gerar Faturamento".
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="font-semibold">Nº Faturamento</TableHead>
                  <TableHead className="font-semibold">Cliente / Dados Fiscais</TableHead>
                  <TableHead className="font-semibold">Proposta</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">Valor Total</TableHead>
                  {isAdmin && (
                    <TableHead className="text-right font-semibold">Impostos (est.)</TableHead>
                  )}
                  <TableHead className="font-semibold">Data</TableHead>
                  <TableHead className="text-right font-semibold">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((fat) => {
                  const isEmitido = fat.status === 'emitido'
                  return (
                    <TableRow key={fat.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono font-bold text-xs text-primary">
                        {fat.numero}
                      </TableCell>

                      <TableCell>
                        <div className="space-y-0.5 max-w-sm">
                          <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{fat.cliente_razao_social}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-2">
                            <span>CNPJ: {fat.cliente_cnpj || 'Não informado'}</span>
                            {fat.cliente_ie && <span>IE: {fat.cliente_ie}</span>}
                          </div>
                          {(fat.cliente_cidade || fat.cliente_uf) && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span>
                                {[fat.cliente_cidade, fat.cliente_uf].filter(Boolean).join(' - ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-xs font-mono">
                        {fat.proposta ? (
                          <Link
                            to={`/propostas/${fat.proposta}`}
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            <span>{fat.proposta_numero || 'Ver Proposta'}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span>{fat.proposta_numero || '—'}</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {isEmitido && fat.nf_numero ? (
                          /* Fiscal F3 — NF lançada: badge fixo com os dados da nota */
                          <div>
                            <Badge
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] gap-1 shadow-xs"
                              title={`NF ${fat.nf_numero}${fat.nf_serie ? '/' + fat.nf_serie : ''} lançada — edite nos detalhes`}
                            >
                              <FileCheck2 className="h-3 w-3" />
                              Emitido
                            </Badge>
                            <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                              NF {fat.nf_numero}
                              {fat.nf_serie ? `/${fat.nf_serie}` : ''}
                              {fat.nf_data_emissao
                                ? ` — ${fat.nf_data_emissao.split('-').reverse().join('/')}`
                                : ''}
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(fat)}
                            disabled={alterandoStatusId === fat.id}
                            className="group focus:outline-none"
                            title="Clique para alternar o status"
                          >
                            {isEmitido ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] gap-1 cursor-pointer transition-colors shadow-xs">
                                <CheckCircle2 className="h-3 w-3" />
                                Emitido
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-amber-600 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-[11px] gap-1 cursor-pointer transition-colors"
                              >
                                <Clock className="h-3 w-3" />
                                Pendente
                              </Badge>
                            )}
                          </button>
                        )}
                        {isEmitido && !fat.nf_numero && fat.data_emissao && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Emissão: {fat.data_emissao}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-mono font-semibold text-xs text-emerald-700 dark:text-emerald-400">
                        {formatBRL(fat.valor_total || 0)}
                      </TableCell>

                      {isAdmin && (
                        <TableCell className="text-right font-mono text-xs">
                          {isEmitido && (fat.impostos_estimados ?? 0) > 0 ? (
                            <div>
                              <div className="text-rose-600 dark:text-rose-400 font-semibold">
                                {formatBRL(fat.impostos_estimados)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                Líq.: {formatBRL(fat.valor_liquido || 0)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}

                      <TableCell className="text-xs text-muted-foreground">
                        {fat.created ? formatDateTime(fat.created) : '—'}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => abrirDetalhes(fat)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Ver detalhes da pré-nota"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExportarIndividual(fat)}
                            className="h-8 text-xs gap-1.5 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            title="Exportar planilha .xlsx para o escritório contábil"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">XLSX</span>
                          </Button>

                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(fat.id)}
                              disabled={isDeleting === fat.id}
                              className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              title="Excluir faturamento"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalhes do Faturamento */}
      <Dialog
        open={Boolean(visualizandoFaturamento)}
        onOpenChange={(open) => !open && setVisualizandoFaturamento(null)}
      >
        <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-6">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-6 w-6 text-primary" />
                <DialogTitle className="text-xl">
                  Faturamento {visualizandoFaturamento?.numero}
                </DialogTitle>
              </div>
              {visualizandoFaturamento && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="font-mono text-xs font-bold text-primary border-primary/40"
                  >
                    Proposta {visualizandoFaturamento.proposta_numero || '—'}
                  </Badge>
                  {visualizandoFaturamento.status === 'emitido' ? (
                    <Badge className="bg-emerald-600 text-white text-xs gap-1">
                      <FileCheck2 className="h-3 w-3" />
                      {visualizandoFaturamento.nf_numero
                        ? `Emitido · NF ${visualizandoFaturamento.nf_numero}${visualizandoFaturamento.nf_serie ? '/' + visualizandoFaturamento.nf_serie : ''}`
                        : 'Emitido'}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-xs"
                    >
                      Pendente
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <DialogDescription>
              Dados fiscais organizados para faturamento e emissão de NF no escritório contábil.
            </DialogDescription>
          </DialogHeader>

          {visualizandoFaturamento && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Box de Dados Fiscais do Cliente */}
              <div className="p-4 rounded-lg bg-muted/20 border border-border space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-primary" />
                    Dados Fiscais do Cliente
                  </h4>
                  <span className="text-[11px] text-muted-foreground">
                    Cadastro conferido e registrado
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Razão Social:</span>
                    <span className="font-semibold text-foreground text-sm">
                      {visualizandoFaturamento.cliente_razao_social}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block text-[11px]">CNPJ / CPF:</span>
                    <span className="font-mono font-medium text-foreground">
                      {visualizandoFaturamento.cliente_cnpj || 'Não informado'}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block text-[11px]">
                      Inscrição Estadual (IE):
                    </span>
                    <span className="font-mono text-foreground">
                      {visualizandoFaturamento.cliente_ie || 'Isento / Não informado'}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block text-[11px]">
                      Contato / Responsável:
                    </span>
                    <span className="text-foreground">
                      {visualizandoFaturamento.cliente_contato || '—'}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground block text-[11px]">
                      Endereço Completo:
                    </span>
                    <span className="text-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {visualizandoFaturamento.cliente_endereco || '—'}
                      {[
                        visualizandoFaturamento.cliente_cidade,
                        visualizandoFaturamento.cliente_uf,
                      ].filter(Boolean).length > 0 &&
                        ` - ${[
                          visualizandoFaturamento.cliente_cidade,
                          visualizandoFaturamento.cliente_uf,
                        ]
                          .filter(Boolean)
                          .join(' / ')}`}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block text-[11px]">
                      E-mail para Envio da NF:
                    </span>
                    <span className="text-foreground flex items-center gap-1 font-mono text-[11px] mt-0.5">
                      <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                      {visualizandoFaturamento.cliente_email || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block text-[11px]">Telefone:</span>
                    <span className="text-foreground flex items-center gap-1 font-mono text-[11px] mt-0.5">
                      <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                      {visualizandoFaturamento.cliente_telefone || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabela de Produtos / Itens (Apenas valores de venda) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" />
                    Itens a Faturar (Preço de Venda)
                  </h4>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    Total: {formatBRL(visualizandoFaturamento.valor_total || 0)}
                  </span>
                </div>

                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs font-semibold">SKU</TableHead>
                        <TableHead className="text-xs font-semibold">
                          Descrição do Produto
                        </TableHead>
                        {isAdmin && (
                          <>
                            <TableHead className="text-xs font-semibold">NCM</TableHead>
                            <TableHead className="text-xs font-semibold">CEST</TableHead>
                          </>
                        )}
                        <TableHead className="text-right text-xs font-semibold">Qtd</TableHead>
                        <TableHead className="text-right text-xs font-semibold">
                          Preço Unit.
                        </TableHead>
                        <TableHead className="text-right text-xs font-semibold">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(visualizandoFaturamento.produtos || []).map((prod, idx) => (
                        <TableRow key={idx} className="text-xs">
                          <TableCell className="font-mono text-[11px] font-bold text-primary">
                            {prod.sku || '—'}
                          </TableCell>
                          <TableCell className="font-medium">{prod.descricao}</TableCell>
                          {isAdmin && (
                            <>
                              <TableCell className="font-mono text-[11px]">
                                {prod.ncm || '—'}
                              </TableCell>
                              <TableCell className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
                                {prod.cest ? formatarCest(prod.cest) : '—'}
                              </TableCell>
                            </>
                          )}
                          <TableCell className="text-right font-mono">{prod.quantidade}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatBRL(prod.valor_unitario)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                            {formatBRL(prod.valor_total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Card de Impostos Estimados — APENAS ADMIN (snapshot do hook fiscal) */}
              {isAdmin && visualizandoFaturamento.status === 'emitido' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Calculator className="h-4 w-4 text-primary" />
                      Impostos Estimados (uso interno — não vai ao cliente)
                    </h4>
                    {(visualizandoFaturamento.regime_tributario || '') !== '' && (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono text-muted-foreground border-border"
                      >
                        Regime:{' '}
                        {visualizandoFaturamento.regime_tributario === 'simples'
                          ? 'Simples Nacional'
                          : visualizandoFaturamento.regime_tributario === 'presumido'
                            ? 'Lucro Presumido'
                            : 'Lucro Real'}
                      </Badge>
                    )}
                  </div>

                  {(visualizandoFaturamento.impostos_estimados ?? 0) > 0 ||
                  (visualizandoFaturamento.valor_liquido ?? 0) > 0 ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                          Impostos estimados
                        </div>
                        <div className="text-lg font-bold font-mono text-rose-700 dark:text-rose-300 mt-0.5">
                          {formatBRL(visualizandoFaturamento.impostos_estimados || 0)}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          Valor líquido
                        </div>
                        <div className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">
                          {formatBRL(visualizandoFaturamento.valor_liquido || 0)}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30 border border-border">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Valor bruto
                        </div>
                        <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                          {formatBRL(visualizandoFaturamento.valor_total || 0)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground p-3 rounded-md bg-muted/20 border border-border">
                      Impostos ainda não calculados. Calcule na página{' '}
                      <Link to="/fiscal" className="text-primary hover:underline font-medium">
                        Fiscal
                      </Link>
                      .
                    </p>
                  )}

                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                      ESTIMATIVA — apuração oficial pelo contador. O sistema não emite NF-e.
                    </span>
                  </div>
                </div>
              )}

              {/* Fiscal F2 — CFOP editável + substituição tributária — APENAS ADMIN */}
              {isAdmin && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Route className="h-4 w-4 text-primary" />
                      CFOP e Substituição Tributária
                    </h4>
                    {fiscalDetalhe ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono text-muted-foreground border-border"
                      >
                        {fiscalDetalhe.mesma_uf
                          ? 'Mesma UF'
                          : `Interestadual${fiscalDetalhe.uf_empresa ? ' (empresa: ' + fiscalDetalhe.uf_empresa + ')' : ''}`}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Calculando...
                      </span>
                    )}
                  </div>

                  {/* CFOP sugerido pelo hook (5.102/6.102; 5.405/6.405 com ST) */}
                  <div className="p-3 rounded-lg bg-muted/20 border border-border flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px]">
                        CFOP da operação
                        {fiscalDetalhe?.cfop && fiscalDetalhe.cfop !== cfopEdicao && (
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            — sugerido: {fiscalDetalhe.cfop}
                          </span>
                        )}
                      </Label>
                      <Input
                        value={cfopEdicao}
                        onChange={(e) => setCfopEdicao(e.target.value)}
                        placeholder="5.102"
                        className="h-8 w-28 font-mono text-xs"
                        maxLength={5}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        4 dígitos — 5.102 mesma UF, 6.102 interestadual (5.405/6.405 com ST).
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={salvarCfop}
                      disabled={salvandoCfop}
                      className="gap-1.5 text-xs"
                    >
                      {salvandoCfop ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Salvar CFOP
                    </Button>
                  </div>

                  {/* Alerta amarelo de substituição tributária + CEST sugerido */}
                  {fiscalDetalhe?.st && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                        <div className="text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                          <p className="font-semibold">
                            Item(s) com NCM sujeito a SUBSTITUIÇÃO TRIBUTÁRIA — CFOP sugerido muda
                            para {fiscalDetalhe.cfop || '5.405/6.405'}:
                          </p>
                          <ul className="list-disc list-inside font-mono">
                            {(fiscalDetalhe.st_itens || []).map((it, i) => (
                              <li key={i}>
                                {it.sku || '—'} — NCM {it.ncm}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      {fiscalDetalhe.cest_sugerido && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={aplicarCestSugerido}
                          className="gap-1.5 text-xs border-amber-400 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
                        >
                          <Barcode className="h-3.5 w-3.5" />
                          Aplicar CEST sugerido ({fiscalDetalhe.cest_sugerido})
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Fiscal F3 — NF Emitida (só admin): lançamento/correção dos dados da nota */}
              {isAdmin && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <FileCheck2 className="h-4 w-4 text-primary" />
                      NF Emitida pelo Contador
                    </h4>
                    {visualizandoFaturamento.nf_numero ? (
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                        Lançada — editável abaixo
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Não lançada</span>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
                    {!visualizandoFaturamento.nf_numero && (
                      <p className="text-[11px] text-muted-foreground">
                        Ao lançar os dados da NF, o faturamento passa para{' '}
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          Emitido
                        </span>{' '}
                        e entra no Livro de Saídas (página Fiscal).
                      </p>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Número da NF</Label>
                        <Input
                          value={nfForm.nf_numero}
                          onChange={(e) => setNfForm((f) => ({ ...f, nf_numero: e.target.value }))}
                          placeholder="1234"
                          className="h-8 font-mono text-xs"
                          maxLength={20}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Série</Label>
                        <Input
                          value={nfForm.nf_serie}
                          onChange={(e) => setNfForm((f) => ({ ...f, nf_serie: e.target.value }))}
                          placeholder="1"
                          className="h-8 font-mono text-xs"
                          maxLength={10}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Data de emissão</Label>
                        <Input
                          type="date"
                          value={nfForm.nf_data_emissao}
                          onChange={(e) =>
                            setNfForm((f) => ({ ...f, nf_data_emissao: e.target.value }))
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Valor total da nota</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={nfForm.nf_valor}
                          onChange={(e) => setNfForm((f) => ({ ...f, nf_valor: e.target.value }))}
                          placeholder="0,00"
                          className="h-8 text-right font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] text-muted-foreground">
                        O sistema não emite NF-e — registra apenas os dados da nota lançada.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={salvarNf}
                        disabled={salvandoNf}
                        className="gap-1.5 text-xs"
                      >
                        {salvandoNf ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        {visualizandoFaturamento.nf_numero
                          ? 'Corrigir lançamento'
                          : 'Lançar NF Emitida'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Observações */}
              {visualizandoFaturamento.observacoes && (
                <div className="p-3 rounded-md bg-muted/20 border border-border text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground block mb-0.5">
                    Observações Fiscais:
                  </span>
                  {visualizandoFaturamento.observacoes}
                </div>
              )}

              {/* Aviso do Sistema */}
              <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/60 flex items-start gap-2 text-xs text-sky-800 dark:text-sky-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
                <span>
                  O ERP Vittorio Design organiza a pré-nota com os dados cadastrais e produtos. A
                  emissão oficial da NF-e é realizada pelo escritório de contabilidade utilizando a
                  planilha .xlsx gerada.
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-border flex items-center justify-between sm:justify-between">
            <div className="flex items-center gap-2">
              {visualizandoFaturamento &&
                (visualizandoFaturamento.status === 'emitido' &&
                visualizandoFaturamento.nf_numero ? (
                  /* Fiscal F3 — NF lançada: só desfaz pelo lançamento (não pelo toggle) */
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={desfazerNf}
                    disabled={salvandoNf}
                    className="text-xs gap-1.5"
                  >
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    Desfazer lançamento da NF
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleStatus(visualizandoFaturamento)}
                    disabled={alterandoStatusId === visualizandoFaturamento.id}
                    className="text-xs gap-1.5"
                  >
                    {visualizandoFaturamento.status === 'emitido' ? (
                      <>
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        Marcar como Pendente
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Marcar como Emitido
                      </>
                    )}
                  </Button>
                ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisualizandoFaturamento(null)}
              >
                Fechar
              </Button>

              {visualizandoFaturamento && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleExportarIndividual(visualizandoFaturamento)}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Exportar Planilha .xlsx
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fiscal F4 — bloqueio de exportação com pendências fiscais (liberação só admin) */}
      <DialogExportacaoPendencias
        fat={pendenciasExport}
        isAdmin={isAdmin}
        onFechar={() => setPendenciasExport(null)}
        onConfirmarLiberacao={(fatLiberado) => {
          setPendenciasExport(null)
          executarExportacao(fatLiberado, true)
        }}
      />
    </div>
  )
}
