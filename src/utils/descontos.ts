import type { Proposta, PropostaItem, DescontoTipo } from '@/types/erp'

export interface TotaisCalculadosProposta {
  /** Soma de (preco_unitario * quantidade) de todos os itens */
  subtotal: number
  /** Soma de total_desconto de todos os itens */
  totalDescontoItens: number
  /** Subtotal após descontos dos itens */
  subtotalAposDescontoItens: number
  /** Valor monetário do desconto geral da proposta */
  totalDescontoGeral: number
  /** Soma de totalDescontoItens + totalDescontoGeral */
  totalDescontos: number
  /** TOTAL FINAL = subtotal - totalDescontos */
  totalFinal: number
  /** Percentual efetivo total de desconto em relação ao subtotal bruto (0-100) */
  percentualDescontoTotal: number
}

/**
 * Calcula os valores de desconto e preço líquido para um item individual
 */
export function calcularDescontoItem(params: {
  precoUnitario: number
  quantidade: number
  descontoTipo?: DescontoTipo
  descontoValor?: number
}): {
  descontoUnitario: number
  precoLiquido: number
  totalDescontoItem: number
  subtotalBrutoItem: number
  subtotalLiquidoItem: number
} {
  const precoUnitario = Math.max(0, Number(params.precoUnitario) || 0)
  const quantidade = Math.max(0, Number(params.quantidade) || 0)
  const subtotalBrutoItem = precoUnitario * quantidade
  const tipo = params.descontoTipo || 'valor'
  const valorInformado = Math.max(0, Number(params.descontoValor) || 0)

  let descontoUnitario = 0

  if (valorInformado > 0) {
    if (tipo === 'percentual') {
      const pct = Math.min(100, valorInformado)
      descontoUnitario = precoUnitario * (pct / 100)
    } else {
      descontoUnitario = Math.min(precoUnitario, valorInformado)
    }
  }

  // Preço líquido unitário (nunca negativo)
  const precoLiquido = Math.max(0, precoUnitario - descontoUnitario)
  const totalDescontoItem = descontoUnitario * quantidade
  const subtotalLiquidoItem = precoLiquido * quantidade

  return {
    descontoUnitario,
    precoLiquido,
    totalDescontoItem,
    subtotalBrutoItem,
    subtotalLiquidoItem,
  }
}

/**
 * Consolida os totais da proposta a partir de seus itens e do desconto geral
 */
export function calcularTotaisProposta(
  itens: PropostaItem[],
  descontoGeralTipo?: DescontoTipo,
  descontoGeralValor?: number,
): TotaisCalculadosProposta {
  let subtotal = 0
  let totalDescontoItens = 0

  for (const it of itens) {
    const calc = calcularDescontoItem({
      precoUnitario: it.preco_unitario,
      quantidade: it.quantidade,
      descontoTipo: it.desconto_tipo,
      descontoValor: it.desconto_valor,
    })
    subtotal += calc.subtotalBrutoItem
    totalDescontoItens += calc.totalDescontoItem
  }

  const subtotalAposDescontoItens = Math.max(0, subtotal - totalDescontoItens)

  // Desconto geral incide sobre o subtotal
  const tipoGeral = descontoGeralTipo || 'valor'
  const valorGeralInformado = Math.max(0, Number(descontoGeralValor) || 0)
  let totalDescontoGeral = 0

  if (valorGeralInformado > 0 && subtotalAposDescontoItens > 0) {
    if (tipoGeral === 'percentual') {
      const pct = Math.min(100, valorGeralInformado)
      totalDescontoGeral = subtotalAposDescontoItens * (pct / 100)
    } else {
      totalDescontoGeral = Math.min(subtotalAposDescontoItens, valorGeralInformado)
    }
  }

  const totalDescontos = totalDescontoItens + totalDescontoGeral
  const totalFinal = Math.max(0, subtotal - totalDescontos)

  const percentualDescontoTotal =
    subtotal > 0 ? Math.min(100, (totalDescontos / subtotal) * 100) : 0

  return {
    subtotal,
    totalDescontoItens,
    subtotalAposDescontoItens,
    totalDescontoGeral,
    totalDescontos,
    totalFinal,
    percentualDescontoTotal,
  }
}
