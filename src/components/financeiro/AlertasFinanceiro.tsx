// Alertas do topo do Módulo Financeiro (exclusivo admin).
// Parcelas vencendo nos próximos 7 dias e parcelas vencidas — clicáveis para a lista.
// Usa UMA listagem única de contas_receber + UMA de contas_pagar (sem rajada).

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Loader2 } from 'lucide-react'
import { fluxoCaixaService, type AlertasFinanceiros } from '@/services/fluxoCaixa'
import { formatBRL } from '@/utils/formatters'

const VAZIO: AlertasFinanceiros = {
  vencendoEm7Dias: { quantidade: 0, valor: 0 },
  vencidas: { quantidade: 0, valor: 0 },
}

export default function AlertasFinanceiro() {
  const [alertas, setAlertas] = useState<AlertasFinanceiros>(VAZIO)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    try {
      const { receber, pagar } = await fluxoCaixaService.listarTudo()
      setAlertas(fluxoCaixaService.alertas(receber, pagar))
    } catch (err) {
      console.error('Erro ao carregar alertas financeiros', err)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando alertas...
      </div>
    )
  }

  const temAlerta = alertas.vencendoEm7Dias.quantidade > 0 || alertas.vencidas.quantidade > 0
  if (!temAlerta) return null

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {alertas.vencendoEm7Dias.quantidade > 0 && (
        <Link
          to="/contas-receber"
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:hover:bg-amber-900/50"
        >
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {alertas.vencendoEm7Dias.quantidade} título(s) vencendo nos próximos 7 dias
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Total de {formatBRL(alertas.vencendoEm7Dias.valor)} a vencer — clique para ver a lista
            </p>
          </div>
        </Link>
      )}

      {alertas.vencidas.quantidade > 0 && (
        <Link
          to="/contas-receber"
          className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 transition-colors hover:bg-red-100 dark:border-red-700 dark:bg-red-950/40 dark:hover:bg-red-900/50"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              {alertas.vencidas.quantidade} título(s) vencido(s)
            </p>
            <p className="text-xs text-red-700 dark:text-red-400">
              Inadimplência de {formatBRL(alertas.vencidas.valor)} — clique para ver a lista
            </p>
          </div>
        </Link>
      )}
    </div>
  )
}
