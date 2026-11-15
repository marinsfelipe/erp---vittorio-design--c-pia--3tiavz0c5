// Exportações .xlsx — Comissões e DRE Simplificado (mesma lib `xlsx` do Financeiro).

import * as XLSX from 'xlsx'
import type { Comissao } from '@/types/financeiro'
import { LABEL_STATUS_COMISSAO } from '@/types/financeiro'
import type { DREMensal } from '@/services/comissoes'
import { nomeMes } from '@/utils/financeiroExport'
import { formatBRL } from '@/utils/formatters'

/** Lista de comissões (admin vê de todos; vendedor exporta as próprias). */
export function exportarComissoesXlsx(comissoes: Comissao[], titulo: string) {
  const wb = XLSX.utils.book_new()

  const linhas = comissoes.map((c) => ({
    Vendedor: c.expand?.vendedor?.name || c.vendedor_nome || '—',
    Proposta: c.proposta_numero || '—',
    Cliente: c.cliente_nome || '—',
    'Valor base (R$)': Number((Number(c.valor_base) || 0).toFixed(2)),
    'Percentual (%)': Number((Number(c.percentual) || 0).toFixed(2)),
    'Comissão (R$)': Number((Number(c.valor) || 0).toFixed(2)),
    Status: LABEL_STATUS_COMISSAO[c.status] || c.status,
    'Data de pagamento': c.data_pagamento
      ? new Date(c.data_pagamento).toLocaleDateString('pt-BR')
      : '—',
  }))

  const ws = XLSX.utils.json_to_sheet(linhas)
  ws['!cols'] = [
    { wch: 26 },
    { wch: 16 },
    { wch: 30 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 18 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, titulo || 'Comissões')

  const dataAtual = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `${(titulo || 'Comissoes').replace(/\s+/g, '_')}_${dataAtual}.xlsx`)
}

/** DRE Simplificado do mês: linhas + cartões em uma aba única. */
export function exportarDREXlsx(dre: DREMensal) {
  const wb = XLSX.utils.book_new()

  const linhas = dre.linhas.map((l) => ({
    Linha: l.rotulo,
    Valor: l.tipo === 'margem' ? `${l.valor.toFixed(2)}%` : Number(l.valor.toFixed(2)),
    'Em R$': l.tipo === 'margem' ? '' : formatBRL(l.valor),
  }))
  linhas.unshift({
    Linha: `DRE Simplificado — ${nomeMes(dre.mes)}/${dre.ano}`,
    Valor: '' as unknown as number,
    'Em R$': '',
  })

  const ws = XLSX.utils.json_to_sheet(linhas)
  ws['!cols'] = [{ wch: 42 }, { wch: 16 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws, 'DRE Simplificado')

  XLSX.writeFile(wb, `DRE_Simplificado_${dre.ano}-${String(dre.mes).padStart(2, '0')}.xlsx`)
}
