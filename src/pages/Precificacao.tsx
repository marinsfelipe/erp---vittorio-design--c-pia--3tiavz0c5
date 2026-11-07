import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { bomsService } from '@/services/boms'
import { parametrosService } from '@/services/parametros'
import { calcularMarkupDivisor, montarPercentuais } from '@/utils/pricing'
import type { Bom, BomItem, Parametro } from '@/types/erp'
import { montarArvore, calcularCustoConsolidado } from '@/utils/bomTree'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Calculator,
  ArrowLeft,
  Save,
  TrendingUp,
  Percent,
  Layers,
  ArrowRight,
  ShieldCheck,
  Building2,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

export default function PrecificacaoPage() {
  const { id } = useParams<{ id: string }>()

  const [bomsList, setBomsList] = useState<Bom[]>([])
  const [selectedBomId, setSelectedBomId] = useState<string>(id || '')
  const [currentBom, setCurrentBom] = useState<Bom | null>(null)
  const [bomItems, setBomItems] = useState<BomItem[]>([])
  const [parametros, setParametros] = useState<Parametro[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Variáveis editáveis de precificação
  const [overheadPct, setOverheadPct] = useState<number>(14.5)
  const [margemPct, setMargemPct] = useState<number>(28.0)

  // Carregar lista de BOMs e Parâmetros
  const loadInitialData = async () => {
    setIsLoading(true)
    try {
      const [allBoms, allParams] = await Promise.all([
        bomsService.getAll(),
        parametrosService.getAll(),
      ])
      setBomsList(allBoms)
      setParametros(allParams)

      const pMap: Record<string, number> = {}
      allParams.forEach((p) => {
        pMap[p.chave] = p.valor_percentual
      })

      const targetId = id || (allBoms.length > 0 ? allBoms[0].id : '')
      setSelectedBomId(targetId)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar dados de precificação')
    } finally {
      setIsLoading(false)
    }
  }

  // Carregar BOM selecionado
  const loadBomDetails = async (bomId: string) => {
    if (!bomId) return
    try {
      const [bom, items] = await Promise.all([
        bomsService.getById(bomId),
        bomsService.getItems(bomId),
      ])
      setCurrentBom(bom)
      setBomItems(items)

      // Se o BOM tem valores personalizados, usar eles, senão os padrões
      const overheadParam = parametros.find((p) => p.chave === 'overhead')?.valor_percentual ?? 14.5
      const margemParam =
        parametros.find((p) => p.chave === 'margem_alvo')?.valor_percentual ?? 28.0

      setOverheadPct(
        bom.overhead_percentual !== undefined ? bom.overhead_percentual : overheadParam,
      )
      setMargemPct(bom.margem_percentual !== undefined ? bom.margem_percentual : margemParam)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar itens do BOM')
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedBomId) {
      loadBomDetails(selectedBomId)
    }
  }, [selectedBomId])

  // Custo Consolidado = rolagem recursiva da árvore multi-nível do BOM
  const custoConsolidado = useMemo(
    () => (currentBom ? calcularCustoConsolidado(montarArvore(currentBom, bomItems).root) : 0),
    [currentBom, bomItems],
  )

  // Percentuais impostos/comissão vêm direto da tabela de parâmetros
  const impostosPct = parametros.find((p) => p.chave === 'impostos')?.valor_percentual ?? 12.0
  const comissaoPct = parametros.find((p) => p.chave === 'comissao')?.valor_percentual ?? 3.5

  // Fórmula oficial (MARKUP DIVISOR): Preço = Custo / (1 − Σ Percentuais).
  // Σ% = TODOS os percentuais da tabela de parâmetros (com override do SKU).
  const pMap: Record<string, number> = {}
  parametros.forEach((p) => {
    pMap[p.chave] = p.valor_percentual
  })
  const percentuais = montarPercentuais(pMap, {
    overhead: overheadPct,
    margem: margemPct,
  })
  const resultado = calcularMarkupDivisor(custoConsolidado, percentuais)

  // Detalhamento da formação de preço (valores embutidos por percentual)
  const precoFinal = resultado.precoVenda
  const divisor = resultado.divisor
  const overheadValor = resultado.valido ? (custoConsolidado * overheadPct) / 100 / divisor : 0
  const margemValor = resultado.valido ? (custoConsolidado * margemPct) / 100 / divisor : 0
  const valorEmbutido = resultado.valorEmbutido

  // Detalhamento adicional dos percentuais financeiros (impostos e comissão estimados no faturamento)
  const impostosValor = (precoFinal * impostosPct) / 100
  const comissaoValor = (precoFinal * comissaoPct) / 100
  const receitaLiquida = precoFinal - impostosValor - comissaoValor
  const lucroContabil = receitaLiquida - custoConsolidado - overheadValor

  const handleSavePricing = async () => {
    if (!currentBom) return
    setIsSaving(true)
    try {
      await bomsService.update(currentBom.id, {
        overhead_percentual: overheadPct,
        margem_percentual: margemPct,
      })
      toast.success('Parâmetros de precificação do SKU atualizados com sucesso!')
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao salvar precificação')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Carregando módulo de precificação...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Precificação Estruturada do Equipamento
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Recálculo em tempo real do preço de venda: Markup Divisor — Custo ÷ (1 − Σ%)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentBom && (
            <Link to={`/boms/${currentBom.id}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <Layers className="h-4 w-4" />
                Editar Itens do BOM
              </Button>
            </Link>
          )}
          <Button
            onClick={handleSavePricing}
            disabled={isSaving || !currentBom || !resultado.valido}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Salvando...' : 'Salvar no SKU'}
          </Button>
        </div>
      </div>

      {/* Seletor de SKU / BOM */}
      <div className="bg-card border border-border p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="w-full md:w-96">
          <Label htmlFor="select-bom" className="text-xs text-muted-foreground mb-1 block">
            Selecione o Equipamento / SKU:
          </Label>
          <Select value={selectedBomId} onValueChange={setSelectedBomId}>
            <SelectTrigger id="select-bom">
              <SelectValue placeholder="Selecione um BOM..." />
            </SelectTrigger>
            <SelectContent>
              {bomsList.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.sku} — {b.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {currentBom && (
          <div className="flex items-center gap-4 text-xs">
            <div className="bg-muted px-3 py-1.5 rounded-md">
              <span className="text-muted-foreground">Linhas de materiais: </span>
              <strong className="text-foreground">{bomItems.length} componentes</strong>
            </div>
            <div className="bg-muted px-3 py-1.5 rounded-md">
              <span className="text-muted-foreground">Categoria: </span>
              <strong className="text-foreground">
                {currentBom.categoria || 'Refrigeração Comercial'}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Painel Principal de Simulação e Precificação */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1 & 2: Controles e Parâmetros */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Parâmetros e Variáveis de Custo do Equipamento
              </CardTitle>
              <CardDescription>
                Ajuste os percentuais abaixo para recalcular instantaneamente os valores e a margem
                final.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Custo Consolidado Base (Não editável diretamente aqui, vem do BOM) */}
              <div className="p-4 bg-muted/40 rounded-xl border border-border flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Custo Consolidado de Materiais (BOM)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Soma de (Quantidade × Custo Unitário) de todos os componentes frigoríficos
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-mono font-bold text-foreground">
                    {formatBRL(custoConsolidado)}
                  </span>
                </div>
              </div>

              {/* Sliders / Inputs dos Percentuais */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 p-3 bg-muted/20 border border-border rounded-lg">
                  <div className="flex justify-between items-center">
                    <Label
                      htmlFor="overhead"
                      className="font-semibold text-xs flex items-center gap-1.5"
                    >
                      <TrendingUp className="h-4 w-4 text-amber-600" />
                      Overhead / Indiretos (%)
                    </Label>
                    <span className="font-mono text-xs font-bold text-amber-600">
                      {formatPercent(overheadPct)}
                    </span>
                  </div>
                  <Input
                    id="overhead"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={overheadPct}
                    onChange={(e) => setOverheadPct(parseFloat(e.target.value) || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Custo de fábrica, manutenção, energia, MOI e infraestrutura.
                  </p>
                  <div className="text-xs font-mono font-semibold text-foreground pt-1 border-t border-border/40">
                    Impacto: + {formatBRL(overheadValor)}
                  </div>
                </div>

                <div className="space-y-2 p-3 bg-muted/20 border border-border rounded-lg">
                  <div className="flex justify-between items-center">
                    <Label
                      htmlFor="margem"
                      className="font-semibold text-xs flex items-center gap-1.5"
                    >
                      <Percent className="h-4 w-4 text-blue-600" />
                      Margem Alvo Desejada (%)
                    </Label>
                    <span className="font-mono text-xs font-bold text-blue-600">
                      {formatPercent(margemPct)}
                    </span>
                  </div>
                  <Input
                    id="margem"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={margemPct}
                    onChange={(e) => setMargemPct(parseFloat(e.target.value) || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Margem bruta de contribuição aplicada sobre o custo.
                  </p>
                  <div className="text-xs font-mono font-semibold text-foreground pt-1 border-t border-border/40">
                    Impacto: + {formatBRL(margemValor)}
                  </div>
                </div>
              </div>

              {/* Informações adicionais do Painel de Parâmetros Financeiros */}
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Encargos e Deduções Comerciais Estimadas (DRE Gerencial)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Impostos s/ Venda:</span>
                      <span className="font-mono font-medium">{formatPercent(impostosPct)}</span>
                    </div>
                    <div className="font-mono text-xs text-foreground font-semibold">
                      {formatBRL(impostosValor)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Comissões de Vendas:</span>
                      <span className="font-mono font-medium">{formatPercent(comissaoPct)}</span>
                    </div>
                    <div className="font-mono text-xs text-foreground font-semibold">
                      {formatBRL(comissaoValor)}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna 3: Card Destaque Preço Final e DRE de Formação de Preço */}
        <div className="space-y-6">
          <Card className="border-primary/30 bg-primary/[0.02] shadow-md">
            <CardHeader className="pb-3 border-b border-border/60">
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                Resultado da Precificação
              </span>
              {!resultado.valido ? (
                <>
                  <CardTitle className="text-base font-bold text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Parâmetro inválido
                  </CardTitle>
                  <CardDescription className="text-xs text-destructive">
                    {resultado.erro}
                  </CardDescription>
                </>
              ) : (
                <>
                  <CardTitle className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
                    {formatBRL(precoFinal)}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Preço final sugerido para tabela comercial
                  </CardDescription>
                </>
              )}
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs">
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">1. Custo Consolidado (BOM):</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatBRL(custoConsolidado)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50 text-amber-700 dark:text-amber-400">
                  <span>2. Σ% (soma dos percentuais):</span>
                  <span className="font-mono font-semibold">
                    {formatPercent(resultado.sigmaPct)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50 text-blue-700 dark:text-blue-400">
                  <span>3. Fator divisor (1 − Σ%):</span>
                  <span className="font-mono font-semibold">{divisor.toFixed(4)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-t-2 border-primary/20 font-bold text-sm">
                  <span className="text-foreground">= Preço de Venda Final:</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">
                    {resultado.valido ? formatBRL(precoFinal) : '— bloqueado —'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50 text-emerald-800 dark:text-emerald-300">
                  <span>Valor embutido (preço − custo):</span>
                  <span className="font-mono font-semibold">
                    {resultado.valido ? formatBRL(valorEmbutido) : '—'}
                  </span>
                </div>
              </div>

              {/* Análise de Viabilidade */}
              <div className="bg-muted/50 p-3 rounded-lg space-y-1.5 border border-border/60">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Lucro Contábil Estimado
                </p>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">
                    Receita Líquida (após impostos/comissão):
                  </span>
                  <span className="font-mono font-medium">{formatBRL(receitaLiquida)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-emerald-800 dark:text-emerald-300">
                    Resultado Líquido Fabril:
                  </span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">
                    {formatBRL(lucroContabil)}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  to="/parametros"
                  className="text-primary hover:underline text-xs flex items-center gap-1"
                >
                  Editar taxas globais na tela de Parâmetros Financeiros
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
