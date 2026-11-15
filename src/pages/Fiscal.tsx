import { useCallback, useEffect, useState } from 'react'
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
import { AlertTriangle, Calculator, FileText, RefreshCw } from 'lucide-react'

/**
 * Página Fiscal — impostos ESTIMADOS por faturamento (exclusiva admin).
 * Cálculo feito no backend (hook fiscal.pb.js); aqui só listamos, calculamos
 * e exibimos total de impostos, valor líquido e o aviso de estimativa.
 */
export default function FiscalPage() {
  const { perfil } = useAuth()
  const { toast } = useToast()
  const [faturamentos, setFaturamentos] = useState<Faturamento[]>([])
  const [detalhes, setDetalhes] = useState<Record<string, ImpostosEstimados>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [calculando, setCalculando] = useState<string | null>(null)

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
            Impostos estimados por faturamento — apuração oficial pelo contador.
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
                            {f.status}
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
