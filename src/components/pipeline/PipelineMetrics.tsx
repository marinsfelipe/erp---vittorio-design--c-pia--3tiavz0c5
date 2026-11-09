import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { DollarSign, CheckCircle2, TrendingUp, Users, Target, BarChart3 } from 'lucide-react'

export interface VendedorStats {
  id: string
  nome: string
  totalProposto: number
  totalVendidoMes: number
  qtdPropostas: number
  qtdVendidasMes: number
  qtdFinalizadas: number // vendidas + perdidas
  taxaConversao: number // vendidas / total * 100 ou vendidas / finalizadas
}

interface PipelineMetricsProps {
  isAdmin: boolean
  isVendedor: boolean
  currentUserName?: string
  totalProposto: number
  totalVendidoMes: number
  taxaConversao: number
  qtdPropostas: number
  qtdVendidasMes: number
  vendedoresStats?: VendedorStats[]
}

export const PipelineMetrics: React.FC<PipelineMetricsProps> = ({
  isAdmin,
  isVendedor,
  currentUserName,
  totalProposto,
  totalVendidoMes,
  taxaConversao,
  qtdPropostas,
  qtdVendidasMes,
  vendedoresStats = [],
}) => {
  return (
    <div className="space-y-4">
      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Proposto */}
        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-muted-foreground">
              {isVendedor ? 'Meu Total Proposto' : 'Total Proposto em Aberto / Pipeline'}
            </CardDescription>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-1">
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatBRL(totalProposto)}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <span>
                {qtdPropostas} {qtdPropostas === 1 ? 'proposta ativa' : 'propostas ativas'}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Total Vendido no Mês */}
        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-muted-foreground">
              {isVendedor ? 'Minhas Vendas (Mês Atual)' : 'Total Vendido (Mês Atual)'}
            </CardDescription>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-1">
            <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {formatBRL(totalVendidoMes)}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <span>
                {qtdVendidasMes} {qtdVendidasMes === 1 ? 'venda fechada' : 'vendas fechadas'}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Taxa de Conversão */}
        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-muted-foreground">
              Taxa de Conversão
            </CardDescription>
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-1">
            <div className="text-2xl font-bold font-mono text-purple-700 dark:text-purple-400">
              {formatPercent(taxaConversao)}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Propostas Vendidas / Concluídas (ou Totais)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Visão do Administrador: Consolidado por Vendedor */}
      {isAdmin && vendedoresStats.length > 0 && (
        <Card className="border-border/80 shadow-sm overflow-hidden">
          <CardHeader className="p-4 pb-3 border-b border-border/60 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-foreground">
                  Consolidado por Vendedor
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {vendedoresStats.length} {vendedoresStats.length === 1 ? 'vendedor' : 'vendedores'}
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Comparativo de desempenho comercial individual dos vendedores cadastrados
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 text-xs">
                  <TableHead className="font-semibold">Vendedor</TableHead>
                  <TableHead className="font-semibold text-right">Total Proposto</TableHead>
                  <TableHead className="font-semibold text-right">Vendido no Mês</TableHead>
                  <TableHead className="font-semibold text-center">Propostas</TableHead>
                  <TableHead className="font-semibold text-center">Vendas (Mês)</TableHead>
                  <TableHead className="font-semibold text-right">Conversão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendedoresStats.map((vs) => (
                  <TableRow key={vs.id} className="hover:bg-muted/30 text-xs">
                    <TableCell className="font-medium text-foreground py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                          {vs.nome.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="truncate">{vs.nome}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground py-2.5">
                      {formatBRL(vs.totalProposto)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400 py-2.5">
                      {formatBRL(vs.totalVendidoMes)}
                    </TableCell>
                    <TableCell className="text-center font-mono text-muted-foreground py-2.5">
                      {vs.qtdPropostas}
                    </TableCell>
                    <TableCell className="text-center font-mono font-semibold text-emerald-700 dark:text-emerald-400 py-2.5">
                      {vs.qtdVendidasMes}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold py-2.5">
                      <Badge
                        variant="secondary"
                        className={
                          vs.taxaConversao >= 50
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : vs.taxaConversao >= 20
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-muted text-muted-foreground'
                        }
                      >
                        {formatPercent(vs.taxaConversao)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
