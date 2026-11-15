import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { fiscalService } from '@/services/fiscal'
import { faturamentosService } from '@/services/faturamentos'
import type { Faturamento, ImpostosEstimados } from '@/types/erp'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatBRL } from '@/utils/formatters'
import { nomeMes } from '@/utils/financeiroExport'
import {
  exportarLivroSaidasXlsx,
  linhasLivroSaidas,
  type LinhaLivroSaidas,
} from '@/utils/livroSaidasExport'
import {
  AlertTriangle,
  BookOpenCheck,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Página Fiscal — impostos ESTIMADOS por faturamento + LIVRO DE SAÍDAS
 * mensal (Fiscal F3, exclusiva admin).
 * Cálculo feito no backend (hook fiscal.pb.js); aqui só listamos, calculamos,
 * exibimos total de impostos, valor líquido, o aviso de estimativa e o
 * livro das NFs emitidas no mês (conferência faturado × emitido).
 */
export default function FiscalPage() {
  const { perfil } = useAuth()
  const { toast } = useToast()
  const [faturamentos, setFaturamentos] = useState<Faturamento[]>([])
  const [detalhes, setDetalhes] = useState<Record<string, ImpostosEstimados>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [calculando, setCalculando] = useState<string | null>(null)

  // Navegação mensal do Livro de Saídas (mesmo padrão do Fluxo de Caixa)
  const agora = new Date()
  const [chaveSelecionada, setChaveSelecionada] = useState(
    agora.getFullYear() * 12 + agora.getMonth(),
  )
  const anoSelecionado = Math.floor(chaveSelecionada / 12)
  const mesSelecionado = (chaveSelecionada % 12) + 1

  const carregar = useCallback(async () => {
    setIsLoading(true)
    try {
      const lista = await faturamentosService.getAll()
      setFaturamentos(lista)
    } catch (err: unknown) {
      console.error(err)
      toast({ title: 'Erro ao carregar faturamentos', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (perfil === 'admin') carregar()
  }, [perfil, carregar])

  const calcular = async (id: string) => {
    setCalculando(id)
    try {
      const res = await fiscalService.calcularImpostos(id)
      setDetalhes((prev) => ({ ...prev, [id]: res }))
      toast({ title: 'Impostos estimados calculados' })
      carregar()
    } catch (err: unknown) {
      console.error(err)
      toast({ title: 'Erro ao calcular impostos', variant: 'destructive' })
    } finally {
      setCalculando(null)
    }
  }

  // Fiscal F3 — linhas do livro do mês selecionado (só NF com lançamento)
  const linhasLivro = useMemo<LinhaLivroSaidas[]>(
    () => linhasLivroSaidas(faturamentos, anoSelecionado, mesSelecionado),
    [faturamentos, anoSelecionado, mesSelecionado],
  )

  const totLivro = useMemo(() => {
    const faturado = linhasLivro.reduce((s, l) => s + (Number(l.faturamento.valor_total) || 0), 0)
    const emitido = linhasLivro.reduce((s, l) => s + (Number(l.faturamento.nf_valor) || 0), 0)
    const impostos = linhasLivro.reduce(
      (s, l) => s + (Number(l.faturamento.impostos_estimados) || 0),
      0,
    )
    return { faturado, emitido, diferenca: emitido - faturado, impostos }
  }, [linhasLivro])

  const conferenciaOk = Math.abs(totLivro.diferenca) < 0.005

  if (perfil !== 'admin') {
    return <p className="p-6 text-sm text-muted-foreground">Acesso restrito a administradores.</p>
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Calculator className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Fiscal</h1>
          <p className="text-sm text-muted-foreground">
            Impostos estimados por faturamento e Livro de Saídas — apuração oficial pelo contador.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faturamentos</CardTitle>
          <CardDescription>
            Total de impostos estimados e valor líquido por faturamento (estimativa).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          ) : faturamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum faturamento registrado. Crie um faturamento no módulo Faturamento.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs">Número</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Emissão</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Valor bruto</TableHead>
                    <TableHead className="text-xs text-right">Impostos (est.)</TableHead>
                    <TableHead className="text-xs text-right">Valor líquido (est.)</TableHead>
                    <TableHead className="text-xs text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faturamentos.map((f) => {
                    const reg = detalhes[f.id]
                    const total = f.impostos_estimados ?? reg?.total ?? 0
                    const liquido = f.valor_liquido ?? reg?.liquido ?? 0
                    const temCalculo = total > 0 || liquido > 0
                    return (
                      <TableRow key={f.id} className="text-xs">
                        <TableCell className="font-mono font-medium">{f.numero}</TableCell>
                        <TableCell className="max-w-[180px] truncate">
                          {f.cliente_razao_social || '—'}
                        </TableCell>
                        <TableCell>{f.data_emissao || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={f.status === 'emitido' ? 'default' : 'secondary'}>
                            {f.status === 'emitido'
                              ? f.nf_numero
                                ? `Emitido · NF ${f.nf_numero}${f.nf_serie ? '/' + f.nf_serie : ''}`
                                : 'Emitido'
                              : 'Pendente'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatBRL(f.valor_total)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {temCalculo ? formatBRL(total) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {temCalculo ? formatBRL(liquido) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={calculando === f.id}
                            onClick={() => calcular(f.id)}
                          >
                            <RefreshCw className="h-3 w-3" />
                            {calculando === f.id ? 'Calculando...' : 'Calcular'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fiscal F3 — Livro de Saídas mensal (admin) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpenCheck className="h-4 w-4 text-primary" />
                Livro de Saídas — {nomeMes(mesSelecionado)}/{anoSelecionado}
              </CardTitle>
              <CardDescription>
                NFs emitidas no mês, com conferência faturado × emitido.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-border bg-muted/30">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setChaveSelecionada((c) => c - 1)}
                  title="Mês anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-semibold px-2 min-w-[112px] text-center">
                  {nomeMes(mesSelecionado)} / {anoSelecionado}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setChaveSelecionada((c) => c + 1)}
                  title="Próximo mês"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                disabled={linhasLivro.length === 0}
                onClick={() => {
                  try {
                    exportarLivroSaidasXlsx(linhasLivro, anoSelecionado, mesSelecionado)
                    toast({
                      title: `Livro de Saídas ${nomeMes(mesSelecionado)}/${anoSelecionado} exportado`,
                    })
                  } catch (err) {
                    console.error(err)
                    toast({ title: 'Erro ao exportar o livro', variant: 'destructive' })
                  }
                }}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                .xlsx
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Resumo do mês */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/20 border border-border">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                NFs emitidas no mês
              </div>
              <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                {linhasLivro.length}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Impostos estimados
              </div>
              <div className="text-lg font-bold font-mono text-rose-700 dark:text-rose-300 mt-0.5">
                {formatBRL(totLivro.impostos)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/20 border border-border">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Faturado / Emitido
              </div>
              <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                {formatBRL(totLivro.faturado)} / {formatBRL(totLivro.emitido)}
              </div>
            </div>
            <div
              className={cn(
                'p-3 rounded-lg border',
                conferenciaOk
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-900/60'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900/60',
              )}
            >
              <div
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wider',
                  conferenciaOk
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400',
                )}
              >
                Diferença (emitido − faturado)
              </div>
              <div
                className={cn(
                  'text-lg font-bold font-mono mt-0.5',
                  conferenciaOk
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-amber-700 dark:text-amber-300',
                )}
              >
                {formatBRL(totLivro.diferenca)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {linhasLivro.length === 0
                  ? 'Sem NFs lançadas no mês'
                  : conferenciaOk
                    ? 'Conferência OK — valores batem'
                    : 'Conferir notas com diferença'}
              </div>
            </div>
          </div>

          {/* Lista de NFs do mês */}
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : linhasLivro.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma NF emitida lançada em {nomeMes(mesSelecionado)}/{anoSelecionado}. Lance a NF
              no diálogo de detalhes do Faturamento.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs">Número</TableHead>
                    <TableHead className="text-xs">Série</TableHead>
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">CFOP</TableHead>
                    <TableHead className="text-xs text-right">Valor faturado</TableHead>
                    <TableHead className="text-xs text-right">Valor emitido</TableHead>
                    <TableHead className="text-xs text-right">Diferença</TableHead>
                    <TableHead className="text-xs text-right">Impostos (est.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasLivro.map(({ faturamento: f, diferenca }) => {
                    const dif = Math.abs(diferenca) >= 0.005
                    return (
                      <TableRow key={f.id} className="text-xs">
                        <TableCell className="font-mono font-medium">{f.nf_numero}</TableCell>
                        <TableCell className="font-mono">{f.nf_serie || '—'}</TableCell>
                        <TableCell>
                          {f.nf_data_emissao
                            ? f.nf_data_emissao.split('-').reverse().join('/')
                            : '—'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {f.cliente_razao_social || '—'}
                        </TableCell>
                        <TableCell className="font-mono">{f.cfop || '—'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBRL(f.valor_total || 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBRL(Number(f.nf_valor) || 0)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono font-semibold',
                            dif
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                              : 'text-emerald-700 dark:text-emerald-400',
                          )}
                        >
                          {formatBRL(diferenca)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-rose-700 dark:text-rose-400">
                          {formatBRL(Number(f.impostos_estimados) || 0)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow className="bg-muted/30 font-semibold text-xs">
                    <TableCell
                      colSpan={5}
                      className="text-right uppercase text-[10px] tracking-wider"
                    >
                      Total do mês
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatBRL(totLivro.faturado)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatBRL(totLivro.emitido)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono',
                        conferenciaOk
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
                      )}
                    >
                      {formatBRL(totLivro.diferenca)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-rose-700 dark:text-rose-400">
                      {formatBRL(totLivro.impostos)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950">
            <BookOpenCheck className="h-4 w-4 mt-0.5 text-sky-600" />
            <p className="text-xs text-sky-700 dark:text-sky-400">
              O Livro de Saídas lista as NFs lançadas pelo admin no Faturamento (dados da nota
              emitida pelo contador). O sistema não emite NF-e — registra apenas os dados para
              conferência.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>ESTIMATIVA — apuração oficial pelo contador.</strong> O sistema não emite NF-e e
          não substitui o contador: todos os cálculos são estimativas para gestão. Regime
          configurado na página Empresa; tabelas editáveis em Parâmetros.
        </p>
      </div>
    </div>
  )
}
