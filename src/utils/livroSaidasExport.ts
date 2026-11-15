// Fiscal F3 — Exportação .xlsx do Livro de Saídas mensal (admin).
// Mesma lib do resto do projeto (SheetJS — import * as XLSX from 'xlsx').

import * as XLSX from 'xlsx'
import type { Faturamento } from '@/types/erp'
import { nomeMes } from '@/utils/financeiroExport'

/** Linha do livro de saídas — uma NF emitida no mês. */
export interface LinhaLivroSaidas {
  faturamento: Faturamento
  /** Diferença emitido − faturado (positivo = emitiu a mais). */
  diferenca: number
}

/** Linhas do livro para o mês/ano selecionado — só NF com lançamento. */
export function linhasLivroSaidas(
  faturamentos: Faturamento[],
  ano: number,
  mes: number,
): LinhaLivroSaidas[] {
  const linhas: LinhaLivroSaidas[] = []
  for (const f of faturamentos) {
    if (f.status !== 'emitido' || !f.nf_numero) continue
    const iso = f.nf_data_emissao || ''
    const d = iso ? new Date(iso + 'T00:00:00') : null
    const anoNf =
      d && !isNaN(d.getTime())
        ? d.getFullYear()
        : new Date(f.updated || f.created || Date.now()).getFullYear()
    const mesNf =
      d && !isNaN(d.getTime())
        ? d.getMonth() + 1
        : new Date(f.updated || f.created || Date.now()).getMonth() + 1
    if (anoNf !== ano || mesNf !== mes) continue
    linhas.push({
      faturamento: f,
      diferenca: (Number(f.nf_valor) || 0) - (Number(f.valor_total) || 0),
    })
  }
  return linhas.sort((a, b) =>
    (a.faturamento.nf_data_emissao || '') > (b.faturamento.nf_data_emissao || '') ? 1 : -1,
  )
}

/** Exporta o livro de saídas do mês em .xlsx (colunas da conferência). */
export function exportarLivroSaidasXlsx(linhas: LinhaLivroSaidas[], ano: number, mes: number) {
  const wb = XLSX.utils.book_new()

  const corpo = linhas.map((l) => {
    const f = l.faturamento
    return {
      Número: f.nf_numero || '',
      Série: f.nf_serie || '',
      Data: f.nf_data_emissao
        ? new Date(f.nf_data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')
        : '',
      Cliente: f.cliente_razao_social || '',
      CFOP: f.cfop || '',
      'Valor faturado (R$)': Number((Number(f.valor_total) || 0).toFixed(2)),
      'Valor emitido (R$)': Number((Number(f.nf_valor) || 0).toFixed(2)),
      'Diferença (R$)': Number(l.diferenca.toFixed(2)),
      'Impostos estimados (R$)': Number((Number(f.impostos_estimados) || 0).toFixed(2)),
    }
  })

  const totFaturado = linhas.reduce((s, l) => s + (Number(l.faturamento.valor_total) || 0), 0)
  const totEmitido = linhas.reduce((s, l) => s + (Number(l.faturamento.nf_valor) || 0), 0)
  const totDiferenca = linhas.reduce((s, l) => s + l.diferenca, 0)
  const totImpostos = linhas.reduce(
    (s, l) => s + (Number(l.faturamento.impostos_estimados) || 0),
    0,
  )

  const ws = XLSX.utils.json_to_sheet([
    ...corpo,
    {
      Número: 'TOTAL',
      Série: '',
      Data: '',
      Cliente: '',
      CFOP: '',
      'Valor faturado (R$)': Number(totFaturado.toFixed(2)),
      'Valor emitido (R$)': Number(totEmitido.toFixed(2)),
      'Diferença (R$)': Number(totDiferenca.toFixed(2)),
      'Impostos estimados (R$)': Number(totImpostos.toFixed(2)),
    },
  ])
  ws['!cols'] = [
    { wch: 10 },
    { wch: 7 },
    { wch: 12 },
    { wch: 34 },
    { wch: 8 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, `Livro Saidas ${String(mes).padStart(2, '0')}`)

  const hoje = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `Livro_Saidas_${nomeMes(mes)}_${ano}_${hoje}.xlsx`)
}
