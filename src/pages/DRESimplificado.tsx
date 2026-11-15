import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { calcularDREMensal, type DREMensal } from '@/services/comissoes'
import { nomeMes } from '@/utils/financeiroExport'
import { formatBRL } from '@/utils/formatters'
import { exportarDREXlsx } from '@/utils/comissoesExport'
import { toast } from 'sonner'

const MESES_ABREV = [
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

export default function DRESimplificadoPage() {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [dre, setDre] = useState<DREMensal | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const resultado = await calcularDREMensal(ano, mes)
      setDre(resultado)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao calcular o DRE do mês.')
      setDre(null)
    } finally {
      setCarregando(false)
    }
  }, [ano, mes])

  useEffect(() => {
    carregar()
  }, [carregar])

  const mesAnterior = () => {
    if (mes === 1) {
      setMes(12)
      setAno((a) => a - 1)
    } else {
      setMes((m) => m - 1)
    }
  }

  const proximoMes = () => {
    if (mes === 12) {
      setMes(1)
      setAno((a) => a + 1)
    } else {
      setMes((m) => m + 1)
    }
  }

  const cartao = (titulo: string, valor: number, cor?: string) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-lg md:text-xl font-bold ${cor || ''}`}>{formatBRL(valor)}</p>
      </CardContent>
    </Card>
  )

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">DRE Simplificado</h1>
          <p className="text-sm text-muted-foreground">
            Demonstrativo de Resultados do Exercício por mês — visão gerencial.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => dre && exportarDREXlsx(dre)}
          disabled={!dre || carregando}
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar .xlsx
        </Button>
      </div>

      {/* Navegação mensal (padrão Fluxo de Caixa) */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="icon" onClick={mesAnterior} aria-label="Mês anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[9rem] text-center text-sm font-semibold">
          {nomeMes(mes)}/{ano}
        </span>
        <Button variant="outline" size="icon" onClick={proximoMes} aria-label="Próximo mês">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground">Calculando DRE…</p>
      ) : !dre ? (
        <p className="text-sm text-muted-foreground">
          Nenhum registro encontrado para este mês. Selecione outro período.
        </p>
      ) : (
        <>
          {/* Cartões */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
            {cartao('Receita bruta', dre.receitaBruta)}
            {cartao('Custos (CPV)', dre.custoProdutos, 'text-red-600')}
            {cartao('Despesas (competência)', dre.despesas, 'text-orange-600')}
            {cartao('Comissões', dre.comissoes, 'text-purple-600')}
            {cartao(
              'Resultado',
              dre.resultado,
              dre.resultado >= 0 ? 'text-green-600' : 'text-red-600',
            )}
          </div>

          {/* Linhas do DRE */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                DRE — {nomeMes(mes)}/{ano}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {dre.linhas.map((l, i) => {
                  const ehResultado = l.tipo === 'resultado'
                  const ehMargem = l.tipo === 'margem'
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between py-2.5 text-sm ${
                        ehResultado ? 'font-bold' : ehMargem ? 'font-semibold' : ''
                      }`}
                    >
                      <span className={ehResultado ? 'text-foreground' : 'text-muted-foreground'}>
                        {l.rotulo}
                      </span>
                      <span
                        className={ehMargem ? '' : ehResultado && l.valor < 0 ? 'text-red-600' : ''}
                      >
                        {l.tipo === 'margem' ? `${l.valor.toFixed(2)}%` : formatBRL(l.valor)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                <strong>Critérios:</strong> Receita bruta = faturamentos com status "emitido" pela
                data de emissão. CPV = custo consolidado dos BOMs das propostas faturadas no mês
                (itens de nível 1, que já consolidam os filhos). Despesas = contas a pagar por
                competência (vencimento), canceladas excluídas. Comissões = comissões pagas com data
                de pagamento no mês + comissões previstas de propostas faturadas no mês.
              </p>
            </CardContent>
          </Card>

          {/* Meses do ano (navegação rápida) */}
          <div className="flex flex-wrap gap-2">
            {MESES_ABREV.map((m, i) => (
              <Button
                key={m}
                size="sm"
                variant={i + 1 === mes ? 'default' : 'outline'}
                className="h-8 w-12 px-0 text-xs"
                onClick={() => setMes(i + 1)}
              >
                {m}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
