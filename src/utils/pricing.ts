import type { Parametro } from '@/types/erp'

/**
 * Fórmula oficial de precificação — MARKUP DIVISOR.
 *
 * Preço de Venda = Custo Consolidado / (1 − Σ Percentuais)
 *
 * Os percentuais (overhead, margem, impostos, comissões etc., da tabela de
 * parâmetros) incidem EMBUTIDOS no preço final. Este é o único lugar onde a
 * fórmula existe: todas as telas (Precificação, BOMs, Propostas) usam este
 * helper para não divergirem.
 */

export interface MarkupDivisorResult {
  /** false quando Σ% ≥ 100% (fator divisor zero ou negativo) */
  valido: boolean
  /** Somatório de todos os percentuais, em pontos percentuais (ex.: 60 = 60%) */
  sigmaPct: number
  /** Fator divisor: 1 − Σ% (ex.: 0.40) */
  divisor: number
  /** Preço de venda = custo / divisor (0 quando inválido) */
  precoVenda: number
  /** Valor embutido no preço = preço − custo (0 quando inválido) */
  valorEmbutido: number
  /** Mensagem de alerta quando inválido */
  erro: string | null
}

/** Soma os percentuais (em %) de todos os parâmetros da tabela. */
export function somaPercentuais(parametros: Parametro[]): number {
  return parametros.reduce((acc, p) => acc + (Number(p.valor_percentual) || 0), 0)
}

/**
 * Monta a lista de percentuais a partir do mapa de parâmetros, aplicando os
 * valores personalizados do SKU (overrides de overhead/margem do BOM) quando
 * definidos. Os percentuais vêm em pontos percentuais (ex.: 14.5 = 14,5%).
 */
export function montarPercentuais(
  map: Record<string, number>,
  overrides?: { overhead?: number; margem?: number },
): number[] {
  const valores: Record<string, number> = { ...map }
  if (overrides?.overhead !== undefined) valores['overhead'] = overrides.overhead
  if (overrides?.margem !== undefined) valores['margem_alvo'] = overrides.margem
  return Object.values(valores)
}

/**
 * Calcula o preço de venda pela fórmula de markup divisor:
 * Preço = Custo / (1 − Σ%). Se Σ% ≥ 100%, o cálculo é bloqueado
 * (divisão por zero/negativa) e `valido` vem false com mensagem de erro.
 */
export function calcularMarkupDivisor(
  custoConsolidado: number,
  percentuais: number[],
): MarkupDivisorResult {
  const custo = Number(custoConsolidado) || 0
  const sigmaPct = percentuais.reduce((acc, p) => acc + (Number(p) || 0), 0)
  const divisor = 1 - sigmaPct / 100

  if (sigmaPct >= 100) {
    return {
      valido: false,
      sigmaPct,
      divisor,
      precoVenda: 0,
      valorEmbutido: 0,
      erro:
        `Parâmetro inválido: o somatório dos percentuais (Σ% = ${sigmaPct.toLocaleString('pt-BR', {
          maximumFractionDigits: 2,
        })}%) é maior ou igual a 100%, tornando o fator divisor (1 − Σ%) ` +
        `${sigmaPct === 100 ? 'zero' : 'negativo'}. Divisão impossível — ajuste a tabela de parâmetros.`,
    }
  }

  const precoVenda = custo / divisor
  return {
    valido: true,
    sigmaPct,
    divisor,
    precoVenda,
    valorEmbutido: precoVenda - custo,
    erro: null,
  }
}
