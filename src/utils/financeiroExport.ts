// Exportações .xlsx do Módulo Financeiro (mesma lib `xlsx` usada em faturamentos).

import * as XLSX from 'xlsx'
import type { ContaPagar, ContaReceber } from '@/types/financeiro'
import type { MesFluxo } from '@/services/fluxoCaixa'
import { LABEL_STATUS_PARCELA, saldoAberto, statusEfetivo } from '@/types/financeiro'
import { LABEL_STATUS_CONTA_PAGAR, saldoAbertoPagar, statusEfetivoPagar } from '@/types/financeiro'
import { formatBRL } from '@/utils/formatters'

const NOMES_MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

export function nomeMes(mes: number): string {
  return NOMES_MESES[(mes - 1) % 12]
}

/** Fluxo de caixa: uma linha por mês, com entradas/saídas/saldo do mês e acumulado */
export function exportarFluxoCaixaXlsx(meses: MesFluxo[], visao: string, ano: number) {
  const wb = XLSX.utils.book_new()

  const linhas = meses.map((m) => ({
    Mês: `${nomeMes(m.mes)}/${m.ano}`,
    Entradas: Number(m.entradas.toFixed(2)),
    Saídas: Number(m.saidas.toFixed(2)),
    'Saldo do mês': Number(m.saldo.toFixed(2)),
    'Saldo acumulado': Number(m.saldoAcumulado.toFixed(2)),
  }))

  const ws = XLSX.utils.json_to_sheet(linhas)
  ws['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Fluxo de Caixa')

  const dataAtual = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `Fluxo_de_Caixa_${visao}_${ano}_${dataAtual}.xlsx`)
}

/**
 * Aging de contas a receber: faixas de atraso com parcelas discriminadas.
 * Agrupa por faixa (A vencer, 1-30, 31-60, 61-90, +90 dias) com saldo em aberto.
 */
export function exportarAgingXlsx(contas: ContaReceber[], contasPagar: ContaPagar[]) {
  const wb = XLSX.utils.book_new()

  function faixaDeAtraso(dias: number): string {
    if (dias <= 0) return 'A vencer'
    if (dias <= 30) return '1-30 dias'
    if (dias <= 60) return '31-60 dias'
    if (dias <= 90) return '61-90 dias'
    return '+90 dias'
  }

  function diasAtraso(vencimento: string): number {
    const venc = new Date(vencimento)
    const hoje = new Date()
    venc.setHours(0, 0, 0, 0)
    hoje.setHours(0, 0, 0, 0)
    return Math.floor((hoje.getTime() - venc.getTime()) / 86400000)
  }

  // ---- Aba 1: resumo por faixa (receber) ----
  const abertasReceber = contas.filter((c) => c.status !== 'pago' && c.status !== 'cancelado')
  const faixasReceber = ['A vencer', '1-30 dias', '31-60 dias', '61-90 dias', '+90 dias']
  const resumoReceber = faixasReceber.map((titulo) => {
    const doGrupo = abertasReceber.filter((c) => faixaDeAtraso(diasAtraso(c.vencimento)) === titulo)
    const total = doGrupo.reduce((s, c) => s + saldoAberto(c), 0)
    return {
      Faixa: titulo,
      'Qtd parcelas': doGrupo.length,
      'Valor em aberto (R$)': Number(total.toFixed(2)),
    }
  })
  const wsResumo = XLSX.utils.json_to_sheet(resumoReceber)
  wsResumo['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Aging Receber')

  // ---- Aba 2: parcelas discriminadas ----
  const linhasReceber = [...contas]
    .sort((a, b) => (a.vencimento > b.vencimento ? 1 : -1))
    .map((c) => {
      const efetivo = statusEfetivo(c)
      return {
        Cliente: c.cliente_nome,
        CNPJ: c.cliente_cnpj || '—',
        Faturamento: c.faturamento_numero,
        Parcela: `${c.numero_parcela}/${c.total_parcelas}`,
        'Valor parcela (R$)': Number((Number(c.valor_parcela) || 0).toFixed(2)),
        'Saldo em aberto (R$)': Number(saldoAberto(c).toFixed(2)),
        Vencimento: new Date(c.vencimento).toLocaleDateString('pt-BR'),
        'Dias atraso': diasAtraso(c.vencimento),
        Faixa: faixaDeAtraso(diasAtraso(c.vencimento)),
        Status: LABEL_STATUS_PARCELA[efetivo] || efetivo,
      }
    })
  const wsReceber = XLSX.utils.json_to_sheet(linhasReceber)
  wsReceber['!cols'] = [
    { wch: 30 },
    { wch: 18 },
    { wch: 16 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsReceber, 'Parcelas a Receber')

  // ---- Aba 3: contas a pagar em aberto (para conciliação) ----
  const abertasPagar = contasPagar.filter((c) => c.status !== 'pago' && c.status !== 'cancelado')
  const linhasPagar = abertasPagar.map((c) => {
    const efetivo = statusEfetivoPagar(c)
    return {
      Fornecedor: c.fornecedor,
      Descrição: c.descricao || '—',
      Categoria: c.categoria || '—',
      'Valor (R$)': Number((Number(c.valor) || 0).toFixed(2)),
      'Saldo em aberto (R$)': Number(saldoAbertoPagar(c).toFixed(2)),
      Vencimento: new Date(c.vencimento).toLocaleDateString('pt-BR'),
      'Dias atraso': diasAtraso(c.vencimento),
      Faixa: faixaDeAtraso(diasAtraso(c.vencimento)),
      Status: LABEL_STATUS_CONTA_PAGAR[efetivo] || efetivo,
    }
  })
  const wsPagar = XLSX.utils.json_to_sheet(linhasPagar)
  wsPagar['!cols'] = [
    { wch: 30 },
    { wch: 30 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsPagar, 'Contas a Pagar')

  const dataAtual = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `Aging_Financeiro_${dataAtual}.xlsx`)
}

/** Linha de texto formatada (usada em descrições de exportação/alertas) */
export function valorTexto(valor: number): string {
  return formatBRL(valor)
}
