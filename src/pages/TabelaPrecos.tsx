import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { bomsService } from '@/services/boms'
import { parametrosService } from '@/services/parametros'
import type { Bom, BomItem, Parametro, OrigemPrecoTabela, TipoSobrepreco } from '@/types/erp'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { montarArvore, calcularCustoConsolidado } from '@/utils/bomTree'
import { montarPercentuais, calcularMarkupDivisor } from '@/utils/pricing'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  DollarSign,
  Search,
  SlidersHorizontal,
  RotateCw,
  Tag,
  Calculator,
  Percent,
  CheckCircle2,
  Sparkles,
  Layers,
  ArrowUpDown,
  FileSpreadsheet,
} from 'lucide-react'
import { toast } from 'sonner'

export interface ProdutoTabelaRow {
  bom: Bom
  sku: string
  nome: string
  categoria: string
  unidade: string
  precoDireto: boolean
  custoConsolidado: number
  precoCalculado: number
  precoFinal: number
  origem: OrigemPrecoTabela
  sobreprecoTipo?: TipoSobrepreco
  sobreprecoValor?: number
}

export default function TabelaPrecosPage() {
  const [boms, setBoms] = useState<Bom[]>([])
  const [parametros, setParametros] = useState<Parametro[]>([])
  const [bomItemsCache, setBomItemsCache] = useState<Record<string, BomItem[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroOrigem, setFiltroOrigem] = useState<string>('todos')

  // Estado do Diálogo de Edição de Preço
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<ProdutoTabelaRow | null>(null)
  const [modalModo, setModalModo] = useState<'calculado' | 'sobrepreco' | 'manual'>('calculado')
  const [sobreprecoTipo, setSobreprecoTipo] = useState<TipoSobrepreco>('percentual')
  const [sobreprecoInput, setSobreprecoInput] = useState<string>('')
  const [precoManualInput, setPrecoManualInput] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [todosBoms, todosParams] = await Promise.all([
        bomsService.getAll(),
        parametrosService.getAll(),
      ])
      setBoms(todosBoms)
      setParametros(todosParams)

      // Carrega os itens dos BOMs que não são preço direto para cálculo do custo consolidado
      const bomsNormais = todosBoms.filter((b) => !b.preco_direto)
      const cache: Record<string, BomItem[]> = {}
      await Promise.all(
        bomsNormais.map(async (b) => {
          try {
            const its = await bomsService.getItems(b.id)
            cache[b.id] = its
          } catch {
            cache[b.id] = []
          }
        }),
      )
      setBomItemsCache(cache)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar dados da tabela de preços.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Mapa de parâmetros para markup divisor
  const pMap = useMemo(() => {
    const map: Record<string, number> = {}
    parametros.forEach((p) => {
      map[p.chave] = p.valor_percentual
    })
    return map
  }, [parametros])

  // Consolidação das linhas de produtos
  const rows: ProdutoTabelaRow[] = useMemo(() => {
    return boms.map((bom) => {
      const ehPrecoDireto = Boolean(bom.preco_direto)
      const items = bomItemsCache[bom.id] || []

      // 1. Custo Consolidado
      const custo = ehPrecoDireto ? 0 : calcularCustoConsolidado(montarArvore(bom, items).root)

      // 2. Preço Calculado (Markup Divisor)
      let precoCalc = 0
      if (ehPrecoDireto) {
        precoCalc = Number(bom.preco_venda) || 0
      } else {
        const percentuais = montarPercentuais(pMap, {
          overhead: bom.overhead_percentual,
          margem: bom.margem_percentual,
        })
        const res = calcularMarkupDivisor(custo, percentuais)
        precoCalc = res.precoVenda
      }

      // 3. Origem e Preço Final
      let origem: OrigemPrecoTabela =
        bom.origem_preco || (ehPrecoDireto ? 'preco_direto' : 'calculado')
      let precoFinal = precoCalc

      if (ehPrecoDireto) {
        origem = 'preco_direto'
        precoFinal = Number(bom.preco_venda) || 0
      } else if (origem === 'sobrepreco') {
        const tipo = bom.sobrepreco_tipo || 'percentual'
        const val = Number(bom.sobrepreco_valor) || 0
        if (tipo === 'percentual') {
          precoFinal = precoCalc * (1 + val / 100)
        } else {
          precoFinal = precoCalc + val
        }
      } else if (origem === 'manual') {
        precoFinal =
          bom.preco_final_tabela !== undefined &&
          bom.preco_final_tabela !== null &&
          Number(bom.preco_final_tabela) > 0
            ? Number(bom.preco_final_tabela)
            : precoCalc
      } else {
        origem = 'calculado'
        precoFinal = precoCalc
      }

      return {
        bom,
        sku: bom.sku,
        nome: bom.nome,
        categoria: bom.categoria || (ehPrecoDireto ? 'Avulso' : 'Geral'),
        unidade: bom.unidade || 'UN',
        precoDireto: ehPrecoDireto,
        custoConsolidado: custo,
        precoCalculado: precoCalc,
        precoFinal: precoFinal,
        origem,
        sobreprecoTipo: bom.sobrepreco_tipo,
        sobreprecoValor: bom.sobrepreco_valor,
      }
    })
  }, [boms, bomItemsCache, pMap])

  // Filtragem
  const rowsFiltradas = useMemo(() => {
    return rows.filter((r) => {
      const q = searchTerm.trim().toLowerCase()
      const matchTexto =
        !q ||
        r.sku.toLowerCase().includes(q) ||
        r.nome.toLowerCase().includes(q) ||
        r.categoria.toLowerCase().includes(q)

      const matchOrigem =
        filtroOrigem === 'todos' ||
        (filtroOrigem === 'calculado' && r.origem === 'calculado') ||
        (filtroOrigem === 'sobrepreco' && r.origem === 'sobrepreco') ||
        (filtroOrigem === 'manual' && r.origem === 'manual') ||
        (filtroOrigem === 'preco_direto' && r.origem === 'preco_direto')

      return matchTexto && matchOrigem
    })
  }, [rows, searchTerm, filtroOrigem])

  // Métricas de cabeçalho
  const metricas = useMemo(() => {
    const total = rows.length
    const calculados = rows.filter((r) => r.origem === 'calculado').length
    const comSobrepreco = rows.filter((r) => r.origem === 'sobrepreco').length
    const manuais = rows.filter((r) => r.origem === 'manual').length
    const avulsos = rows.filter((r) => r.origem === 'preco_direto').length
    return { total, calculados, comSobrepreco, manuais, avulsos }
  }, [rows])

  // Abrir modal de edição
  const handleEditarPreco = (row: ProdutoTabelaRow) => {
    setEditingRow(row)
    if (row.precoDireto) {
      toast.info('Produtos avulsos de preço direto não recebem sobrepreço ou cálculo por markup.')
      return
    }

    const o = row.origem === 'sobrepreco' || row.origem === 'manual' ? row.origem : 'calculado'
    setModalModo(o)
    setSobreprecoTipo(row.sobreprecoTipo || 'percentual')
    setSobreprecoInput(
      row.sobreprecoValor !== undefined && row.sobreprecoValor !== null
        ? String(row.sobreprecoValor)
        : '',
    )
    setPrecoManualInput(
      row.origem === 'manual' && row.precoFinal > 0 ? String(row.precoFinal.toFixed(2)) : '',
    )
    setDialogOpen(true)
  }

  // Cálculo prévio no modal
  const previewPrecoFinal = useMemo(() => {
    if (!editingRow) return 0
    const calc = editingRow.precoCalculado
    if (modalModo === 'calculado') {
      return calc
    }
    if (modalModo === 'sobrepreco') {
      const v = parseFloat(sobreprecoInput.replace(',', '.')) || 0
      if (sobreprecoTipo === 'percentual') {
        return calc * (1 + v / 100)
      }
      return calc + v
    }
    if (modalModo === 'manual') {
      const m = parseFloat(precoManualInput.replace(',', '.')) || 0
      return m
    }
    return calc
  }, [editingRow, modalModo, sobreprecoTipo, sobreprecoInput, precoManualInput])

  // Salvar alterações
  const handleSalvarPreco = async () => {
    if (!editingRow) return
    setIsSaving(true)

    try {
      const updatePayload: Partial<Bom> = {}

      if (modalModo === 'calculado') {
        updatePayload.origem_preco = 'calculado'
        updatePayload.sobrepreco_tipo = 'nenhum'
        updatePayload.sobrepreco_valor = 0
        updatePayload.preco_final_tabela = editingRow.precoCalculado
        updatePayload.preco_venda = editingRow.precoCalculado
      } else if (modalModo === 'sobrepreco') {
        const v = parseFloat(sobreprecoInput.replace(',', '.')) || 0
        if (v === 0) {
          toast.error('Informe um valor de sobrepreço válido (diferente de zero).')
          setIsSaving(false)
          return
        }
        const precoCalculadoComSobre =
          sobreprecoTipo === 'percentual'
            ? editingRow.precoCalculado * (1 + v / 100)
            : editingRow.precoCalculado + v

        updatePayload.origem_preco = 'sobrepreco'
        updatePayload.sobrepreco_tipo = sobreprecoTipo
        updatePayload.sobrepreco_valor = v
        updatePayload.preco_final_tabela = precoCalculadoComSobre
        updatePayload.preco_venda = precoCalculadoComSobre
      } else if (modalModo === 'manual') {
        const m = parseFloat(precoManualInput.replace(',', '.')) || 0
        if (m <= 0) {
          toast.error('Informe um preço final manual maior que zero.')
          setIsSaving(false)
          return
        }
        updatePayload.origem_preco = 'manual'
        updatePayload.sobrepreco_tipo = 'nenhum'
        updatePayload.sobrepreco_valor = 0
        updatePayload.preco_final_tabela = m
        updatePayload.preco_venda = m
      }

      await bomsService.update(editingRow.bom.id, updatePayload)
      toast.success(`Preço da tabela atualizado para o SKU ${editingRow.sku}!`)
      setDialogOpen(false)
      loadData()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao salvar preço na tabela.')
    } finally {
      setIsSaving(false)
    }
  }

  const renderBadgeOrigem = (origem: OrigemPrecoTabela, row?: ProdutoTabelaRow) => {
    switch (origem) {
      case 'calculado':
        return (
          <Badge
            variant="outline"
            className="text-xs gap-1 border-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 font-semibold"
          >
            <Calculator className="h-3 w-3" />
            Calculado
          </Badge>
        )
      case 'sobrepreco':
        return (
          <Badge
            variant="outline"
            className="text-xs gap-1 border-purple-400 text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300 font-semibold"
          >
            <Percent className="h-3 w-3" />
            Com sobrepreço
            {row && row.sobreprecoValor !== undefined && row.sobreprecoValor !== null ? (
              <span className="text-[10px] font-mono ml-0.5 opacity-90">
                (
                {row.sobreprecoTipo === 'percentual'
                  ? `+${row.sobreprecoValor}%`
                  : `+${formatBRL(row.sobreprecoValor)}`}
                )
              </span>
            ) : null}
          </Badge>
        )
      case 'manual':
        return (
          <Badge
            variant="outline"
            className="text-xs gap-1 border-emerald-400 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold"
          >
            <Sparkles className="h-3 w-3" />
            Manual
          </Badge>
        )
      case 'preco_direto':
        return (
          <Badge
            variant="secondary"
            className="text-xs gap-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
          >
            <Tag className="h-3 w-3" />
            Preço Direto
          </Badge>
        )
      default:
        return <Badge variant="outline">Calculado</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Tabela de Preços</h1>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
              Somente Administrador
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão estratégica dos preços de venda finais. Novas propostas puxam o preço final da
            tabela por padrão.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
            className="gap-2 text-xs"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Link to="/precificacao">
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <Calculator className="h-3.5 w-3.5" />
              Simulador Markup
            </Button>
          </Link>
          <Link to="/propostas">
            <Button size="sm" className="gap-2 text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Propostas Comerciais
            </Button>
          </Link>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <CardDescription className="text-xs">Total de Produtos</CardDescription>
          <CardTitle className="text-xl font-bold">{metricas.total}</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">Cadastrados no sistema</p>
        </Card>
        <Card className="p-3">
          <CardDescription className="text-xs">Preço Calculado</CardDescription>
          <CardTitle className="text-xl font-bold text-blue-600 dark:text-blue-400">
            {metricas.calculados}
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">Via markup divisor puro</p>
        </Card>
        <Card className="p-3">
          <CardDescription className="text-xs">Com Sobrepreço</CardDescription>
          <CardTitle className="text-xl font-bold text-purple-600 dark:text-purple-400">
            {metricas.comSobrepreco}
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">Taxas / margem posterior</p>
        </Card>
        <Card className="p-3">
          <CardDescription className="text-xs">Preço Manual</CardDescription>
          <CardTitle className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {metricas.manuais}
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">Definido manualmente</p>
        </Card>
        <Card className="p-3 col-span-2 md:col-span-1">
          <CardDescription className="text-xs">Preço Direto</CardDescription>
          <CardTitle className="text-xl font-bold text-amber-600 dark:text-amber-400">
            {metricas.avulsos}
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">Produtos avulsos sem BOM</p>
        </Card>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, produto ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Origem:
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant={filtroOrigem === 'todos' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroOrigem('todos')}
              className="text-xs h-8 px-2.5"
            >
              Todos ({rows.length})
            </Button>
            <Button
              variant={filtroOrigem === 'calculado' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroOrigem('calculado')}
              className="text-xs h-8 px-2.5"
            >
              Calculado ({metricas.calculados})
            </Button>
            <Button
              variant={filtroOrigem === 'sobrepreco' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroOrigem('sobrepreco')}
              className="text-xs h-8 px-2.5"
            >
              Com sobrepreço ({metricas.comSobrepreco})
            </Button>
            <Button
              variant={filtroOrigem === 'manual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroOrigem('manual')}
              className="text-xs h-8 px-2.5"
            >
              Manual ({metricas.manuais})
            </Button>
            <Button
              variant={filtroOrigem === 'preco_direto' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroOrigem('preco_direto')}
              className="text-xs h-8 px-2.5"
            >
              Preço Direto ({metricas.avulsos})
            </Button>
          </div>
        </div>
      </div>

      {/* Tabela de Preços Principal */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">
              Carregando produtos e recalculando preços da tabela...
            </div>
          ) : rowsFiltradas.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <DollarSign className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold">Nenhum produto encontrado</p>
              <p className="text-xs text-muted-foreground">
                Tente ajustar os termos de busca ou o filtro de origem.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="font-semibold">Código (SKU)</TableHead>
                  <TableHead className="font-semibold">Descrição do Produto</TableHead>
                  <TableHead className="text-right font-semibold">Custo Consolidado</TableHead>
                  <TableHead className="text-right font-semibold">
                    Preço Calculado (Markup)
                  </TableHead>
                  <TableHead className="text-right font-semibold text-primary">
                    Preço Final da Tabela
                  </TableHead>
                  <TableHead className="text-center font-semibold">Origem do Preço</TableHead>
                  <TableHead className="text-right font-semibold">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsFiltradas.map((r) => {
                  const diferencaCalculado = r.precoFinal - r.precoCalculado
                  const diferencaPct =
                    r.precoCalculado > 0 ? (diferencaCalculado / r.precoCalculado) * 100 : 0

                  return (
                    <TableRow key={r.bom.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-bold text-primary">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {r.precoDireto ? (
                            <span>{r.sku}</span>
                          ) : (
                            <Link to={`/boms/${r.bom.id}`} className="hover:underline">
                              {r.sku}
                            </Link>
                          )}
                          {r.precoDireto && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1 py-0 font-normal bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            >
                              Avulso
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium text-foreground">{r.nome}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>{r.categoria}</span>
                          <span>•</span>
                          <span>Unidade: {r.unidade}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {r.precoDireto ? '—' : formatBRL(r.custoConsolidado)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <div className="font-medium">{formatBRL(r.precoCalculado)}</div>
                        {!r.precoDireto && (
                          <div className="text-[10px] text-muted-foreground font-sans">
                            Margem {r.bom.margem_percentual ?? 28}% | OH{' '}
                            {r.bom.overhead_percentual ?? 14.5}%
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-base font-bold text-foreground">
                        <div className="text-primary font-bold">{formatBRL(r.precoFinal)}</div>
                        {r.origem !== 'calculado' && !r.precoDireto && (
                          <div
                            className={`text-[10px] font-mono ${
                              diferencaCalculado >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {diferencaCalculado >= 0 ? '+' : ''}
                            {formatBRL(diferencaCalculado)} ({diferencaPct >= 0 ? '+' : ''}
                            {diferencaPct.toFixed(1)}%)
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {renderBadgeOrigem(r.origem, r)}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.precoDireto ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            className="text-xs text-muted-foreground"
                          >
                            Preço Direto
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditarPreco(r)}
                            className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            Ajustar Preço
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Observação informativa */}
      <div className="p-4 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">Regras da Tabela de Preços:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            <strong>Calculado:</strong> Utiliza o valor exato calculado pela fórmula oficial do
            Markup Divisor: Custo Consolidado ÷ (1 − Σ%).
          </li>
          <li>
            <strong>Com Sobrepreço:</strong> Aplica uma taxa percentual (%) ou valor fixo em R$
            sobre o preço calculado.
          </li>
          <li>
            <strong>Manual:</strong> Sobrepõe integralmente o preço calculado por um valor
            arbitrário proposto pelo administrador.
          </li>
          <li>
            <strong>Novas Propostas:</strong> Sempre adotam o Preço Final da Tabela como preço
            unitário padrão.
          </li>
          <li>
            <strong>Propostas Existentes:</strong> Propostas já geradas ou enviadas mantêm seus
            valores gravados e nunca são alteradas retroativamente.
          </li>
        </ul>
      </div>

      {/* Diálogo de Edição de Preço da Tabela */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <DialogTitle>Ajustar Preço da Tabela</DialogTitle>
            </div>
            <DialogDescription>
              Defina como o preço final deste produto será gerado na tabela.
            </DialogDescription>
          </DialogHeader>

          {editingRow && (
            <div className="space-y-4 py-2">
              {/* Resumo do Produto */}
              <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-primary">{editingRow.sku}</span>
                  <span className="text-xs text-muted-foreground">
                    Custo:{' '}
                    <strong className="font-mono">{formatBRL(editingRow.custoConsolidado)}</strong>
                  </span>
                </div>
                <p className="text-sm font-semibold">{editingRow.nome}</p>
                <div className="text-xs text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                  <span>Preço Calculado (Markup):</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatBRL(editingRow.precoCalculado)}
                  </span>
                </div>
              </div>

              {/* Seleção do Modo de Origem */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Origem do Preço
                </Label>
                <RadioGroup
                  value={modalModo}
                  onValueChange={(val) => setModalModo(val as any)}
                  className="space-y-2"
                >
                  {/* Opção 1: Calculado */}
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 cursor-pointer transition-colors">
                    <RadioGroupItem value="calculado" className="mt-1" />
                    <div className="space-y-0.5 text-xs">
                      <span className="font-bold text-foreground block">
                        Preço Calculado (Markup Divisor)
                      </span>
                      <span className="text-muted-foreground block">
                        Usa diretamente o valor matemático obtido pelo custo dos componentes e
                        percentuais financeiros.
                      </span>
                      <span className="font-mono font-semibold text-primary block mt-1">
                        {formatBRL(editingRow.precoCalculado)}
                      </span>
                    </div>
                  </label>

                  {/* Opção 2: Sobrepreço */}
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 cursor-pointer transition-colors">
                    <RadioGroupItem value="sobrepreco" className="mt-1" />
                    <div className="space-y-1 text-xs flex-1">
                      <span className="font-bold text-foreground block">
                        Aplicar Taxa / Sobrepreço Posterior
                      </span>
                      <span className="text-muted-foreground block">
                        Soma uma taxa posterior sobre o preço calculado (em percentual % ou valor
                        R$).
                      </span>

                      {modalModo === 'sobrepreco' && (
                        <div className="pt-2 space-y-2">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={sobreprecoTipo === 'percentual' ? 'default' : 'outline'}
                              onClick={() => setSobreprecoTipo('percentual')}
                              className="text-xs h-7 px-2.5 gap-1"
                            >
                              <Percent className="h-3 w-3" />
                              Percentual (%)
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={sobreprecoTipo === 'valor' ? 'default' : 'outline'}
                              onClick={() => setSobreprecoTipo('valor')}
                              className="text-xs h-7 px-2.5 gap-1"
                            >
                              <DollarSign className="h-3 w-3" />
                              Valor Fixo (R$)
                            </Button>
                          </div>

                          <div className="relative">
                            <Input
                              type="number"
                              step="any"
                              placeholder={
                                sobreprecoTipo === 'percentual'
                                  ? 'Ex: 10 (para +10%)'
                                  : 'Ex: 500 (para +R$ 500,00)'
                              }
                              value={sobreprecoInput}
                              onChange={(e) => setSobreprecoInput(e.target.value)}
                              className="font-mono"
                              autoFocus
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </label>

                  {/* Opção 3: Manual */}
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 cursor-pointer transition-colors">
                    <RadioGroupItem value="manual" className="mt-1" />
                    <div className="space-y-1 text-xs flex-1">
                      <span className="font-bold text-foreground block">
                        Preço Final Proposto Manualmente
                      </span>
                      <span className="text-muted-foreground block">
                        Define diretamente o valor final de tabela, sobrepondo o cálculo automático.
                      </span>

                      {modalModo === 'manual' && (
                        <div className="pt-2 space-y-1.5">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
                              R$
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              placeholder="0,00"
                              value={precoManualInput}
                              onChange={(e) => setPrecoManualInput(e.target.value)}
                              className="pl-10 font-mono text-base font-semibold"
                              autoFocus
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {/* Pré-visualização do Preço Final Gerado */}
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground block">
                    Preço Final da Tabela Resultante:
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {renderBadgeOrigem(modalModo)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold font-mono text-primary block">
                    {formatBRL(previewPrecoFinal)}
                  </span>
                  {modalModo !== 'calculado' && editingRow.precoCalculado > 0 && (
                    <span className="text-[11px] text-muted-foreground font-mono block">
                      Ref. calculado: {formatBRL(editingRow.precoCalculado)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSalvarPreco} disabled={isSaving} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {isSaving ? 'Salvando...' : 'Confirmar Preço da Tabela'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
