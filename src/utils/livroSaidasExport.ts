// Fiscal F3 — Exportação .xlsx do Livro de Saídas mensal (admin).
// Mesma lib do resto do projeto (SheetJS — import * as XLSX from 'xlsx').

import * as XLSX from 'xlsx'
import type { Faturamento, RegimeTributario } from '@/types/erp'
import { csosnOuCstPorRegime } from '@/utils/fiscalExportacao'
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

/**
 * Fiscal F3/F4 — Exporta o livro de saídas do mês em .xlsx, consistente com o
 * formato da pré-nota (F4): colunas fiscais (CFOP, CSOSN/CST pelo regime da
 * Empresa, CNPJ/UF do cliente) + impostos estimados por NF e no total.
 */
export function exportarLivroSaidasXlsx(
  linhas: LinhaLivroSaidas[],
  ano: number,
  mes: number,
  empresa?: { regime?: RegimeTributario | '' } | null,
) {
  const wb = XLSX.utils.book_new()
  const csosn = csosnOuCstPorRegime(empresa?.regime)
  const regimeTexto =
    empresa?.regime === 'presumido'
      ? 'Lucro Presumido'
      : empresa?.regime === 'real'
        ? 'Lucro Real'
        : 'Simples Nacional'

  const corpo = linhas.map((l) => {
    const f = l.faturamento
    return {
      Número: f.nf_numero || '',
      Série: f.nf_serie || '',
      Data: f.nf_data_emissao
        ? new Date(f.nf_data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')
        : '',
      Cliente: f.cliente_razao_social || '',
      'CNPJ do Cliente': f.cliente_cnpj || '',
      'UF do Cliente': f.cliente_uf || '',
      CFOP: f.cfop || '',
      [csosn.chave]: csosn.valor,
      'Valor faturado (R$)': Number((Number(f.valor_total) || 0).toFixed(2)),
      'Valor emitido (R$)': Number((Number(f.nf_valor) || 0).toFixed(2)),
      'Diferença (R$)': Number(l.diferenca.toFixed(2)),
      'Impostos estimados (R$)': Number((Number(f.impostos_estimados) || 0).toFixed(2)),
      'Valor líquido estimado (R$)': Number((Number(f.valor_liquido) || 0).toFixed(2)),
    }
  })

  const tot = (campo: (l: LinhaLivroSaidas) => number) =>
    Number(linhas.reduce((s, l) => s + campo(l), 0).toFixed(2))

  const ws = XLSX.utils.json_to_sheet([
    ...corpo,
    {
      Número: 'TOTAL',
      Série: '',
      Data: '',
      Cliente: '',
      'CNPJ do Cliente': '',
      'UF do Cliente': '',
      CFOP: '',
      [csosn.chave]: '',
      'Valor faturado (R$)': tot((l) => Number(l.faturamento.valor_total) || 0),
      'Valor emitido (R$)': tot((l) => Number(l.faturamento.nf_valor) || 0),
      'Diferença (R$)': tot((l) => l.diferenca),
      'Impostos estimados (R$)': tot((l) => Number(l.faturamento.impostos_estimados) || 0),
      'Valor líquido estimado (R$)': tot((l) => Number(l.faturamento.valor_liquido) || 0),
    },
  ])
  ws['!cols'] = [
    { wch: 10 },
    { wch: 7 },
    { wch: 12 },
    { wch: 34 },
    { wch: 18 },
    { wch: 8 },
    { wch: 8 },
    { wch: 38 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 22 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, `Livro Saidas ${String(mes).padStart(2, '0')}`)

  // Aba de impostos estimados — mesmo formato da aba da pré-nota (F4)
  const totImpostos = tot((l) => Number(l.faturamento.impostos_estimados) || 0)
  const totLiquido = tot((l) => Number(l.faturamento.valor_liquido) || 0)
  const wsImp = XLSX.utils.json_to_sheet([
    { Indicador: 'Regime', Valor: regimeTexto },
    { Indicador: 'Mês', Valor: `${nomeMes(mes)} / ${ano}` },
    { Indicador: 'NFs emitidas no mês', Valor: linhas.length },
    { Indicador: 'Impostos estimados no mês (R$)', Valor: totImpostos },
    { Indicador: 'Valor líquido estimado no mês (R$)', Valor: totLiquido },
    { Indicador: '', Valor: '' },
    {
      Indicador: 'NOTA',
      Valor:
        'ESTIMATIVA gerada pelo ERP — apuração oficial pelo escritório contábil. O sistema NÃO emite NF-e.',
    },
  ])
  wsImp['!cols'] = [{ wch: 36 }, { wch: 28 }]
  XLSX.utils.book_append_sheet(wb, wsImp, 'Impostos Estimados')

  const hoje = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `Livro_Saidas_${nomeMes(mes)}_${ano}_${hoje}.xlsx`)
}
