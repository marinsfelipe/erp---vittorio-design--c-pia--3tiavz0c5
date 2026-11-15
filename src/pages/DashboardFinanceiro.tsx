// Dashboard Financeiro — Módulo Financeiro (admin-only).
// Gráfico receitas x despesas por mês (recharts), cartões de totais, inadimplência,
// top 5 clientes e alertas do topo. Carrega com DUAS listagens únicas (sem rajadas).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { useToast } from '@/hooks/use-toast'
import { formatBRL } from '@/utils/formatters'
import {
  entradasPrevistasPorMes,
  entradasRealizadasPorMes,
  fluxoCaixaService,
  mesDeChave,
  saidasPrevistasPorMes,
  saidasRealizadasPorMes,
  type ClienteTop,
  type ResumoDashboard,
} from '@/services/fluxoCaixa'
import { exportarAgingXlsx } from '@/utils/financeiroExport'
import { Download, Loader2 } from 'lucide-react'
import AlertasFinanceiro from '@/components/financeiro/AlertasFinanceiro'
import type { ContaPagar, ContaReceber } from '@/types/financeiro'

const NOMES_MESES_ABREV = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

const chartConfig = {
  receitas: { label: 'Receitas (realizado)', color: 'hsl(var(--chart-1))' },
  despesas: { label: 'Despesas (realizado)', color: 'hsl(var(--chart-2))' },
  receitasPrevistas: { label: 'Receitas (previsto)', color: 'hsl(var(--chart-3))' },
  despesasPrevistas: { label: 'Despesas (previsto)', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig

interface PontoGrafico {
  mes: string
  receitas: number
  despesas: number
  receitasPrevistas: number
  despesasPrevistas: number
}

export default function DashboardFinanceiroPage() {
  const { toast } = useToast()
  const [receber, setReceber] = useState<ContaReceber[]>([])
  const [pagar, setPagar] = useState<ContaPagar[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const dados = await fluxoCaixaService.listarTudo()
      setReceber(dados.receber)
      setPagar(dados.pagar)
    } catch (err) {
      console.error('Erro ao carregar dashboard financeiro', err)
      toast({
        title: 'Erro ao carregar dashboard financeiro',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => {
    carregar()
  }, [carregar])

  const resumo = useMemo<ResumoDashboard>(
    () => fluxoCaixaService.resumoDashboard(receber, pagar),
    [receber, pagar],
  )

  const top5 = useMemo<ClienteTop[]>(() => fluxoCaixaService.top5Clientes(receber), [receber])

  const grafico = useMemo<PontoGrafico[]>(() => {
    const recReal = entradasRealizadasPorMes(receber)
    const despReal = saidasRealizadasPorMes(pagar)
    const recPrev = entradasPrevistasPorMes(receber)
    const despPrev = saidasPrevistasPorMes(pagar)

    // Últimos 12 meses (inclusive o corrente)
    const hoje = new Date()
    const pontos: PontoGrafico[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const chave = chaveMesLocal(d.getFullYear(), d.getMonth() + 1)
      pontos.push({
        mes: NOMES_MESES_ABREV[d.getMonth()],
        receitas: recReal.get(chave) || 0,
        despesas: despReal.get(chave) || 0,
        receitasPrevistas: recPrev.get(chave) || 0,
        despesasPrevistas: despPrev.get(chave) || 0,
      })
    }
    return pontos
  }, [receber, pagar])

  function exportarAging() {
    exportarAgingXlsx(receber, pagar)
    toast({
      title: 'Aging exportado',
      description: 'Arquivo .xlsx gerado com resumo por faixa e parcelas discriminadas.',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Financeiro</h1>
          <p className="text-muted-foreground text-sm">
            Visão geral do módulo Financeiro: recebimentos, pagamentos e inadimplência.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarAging} disabled={carregando}>
            <Download className="mr-2 h-4 w-4" /> Exportar aging .xlsx
          </Button>
          <Button asChild>
            <Link to="/fluxo-caixa">Fluxo de caixa</Link>
          </Button>
        </div>
      </div>

      <AlertasFinanceiro />

      {/* Cartões de totais */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total a receber
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatBRL(resumo.totalAReceber)}</p>
            <p className="text-xs text-muted-foreground">saldo pendente de contas a receber</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total a pagar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{formatBRL(resumo.totalAPagar)}</p>
            <p className="text-xs text-muted-foreground">saldo pendente de contas a pagar</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Inadimplência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{formatBRL(resumo.inadimplencia)}</p>
            <p className="text-xs text-muted-foreground">
              {resumo.quantidadeAtrasadas} parcela(s) vencida(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico receitas x despesas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Receitas x Despesas — últimos 12 meses
          </CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando gráfico...
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <ComposedChart data={grafico} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={72}
                  tickFormatter={(v: number) =>
                    `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`
                  }
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="receitas" fill="var(--color-receitas)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" fill="var(--color-despesas)" radius={[4, 4, 0, 0]} />
                <Line
                  dataKey="receitasPrevistas"
                  stroke="var(--color-receitasPrevistas)"
                  strokeDasharray="6 4"
                  dot={false}
                />
                <Line
                  dataKey="despesasPrevistas"
                  stroke="var(--color-despesasPrevistas)"
                  strokeDasharray="6 4"
                  dot={false}
                />
              </ComposedChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Top 5 clientes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Top 5 clientes (por valor faturado nas parcelas)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {top5.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum cliente com parcelas geradas ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {top5.map((c, idx) => {
                const max = top5[0].totalFaturado || 1
                const pct = Math.round((c.totalFaturado / max) * 100)
                return (
                  <div key={c.cliente_nome}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {idx + 1}. {c.cliente_nome}
                        {c.cliente_cnpj ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {c.cliente_cnpj}
                          </span>
                        ) : null}
                      </span>
                      <span className="whitespace-nowrap text-muted-foreground">
                        faturado {formatBRL(c.totalFaturado)} · recebido{' '}
                        {formatBRL(c.totalRecebido)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function chaveMesLocal(ano: number, mes: number): number {
  return ano * 12 + (mes - 1)
}
