// Service do Módulo Financeiro — Funcionalidade 4: Comissões e DRE Simplificado.
// TODAS as leituras usam getFullList únicos (sem rajada por registro — evita 429).

import pb from '@/lib/pocketbase/client'
import type { Comissao, FiltrosComissoes } from '@/types/financeiro'
import type { Faturamento } from '@/types/erp'
import type { Bom, BomItem } from '@/types/erp'
import { montarArvore, montarContextoCusto, calcularCustoConsolidado } from '@/utils/bomTree'
import { chaveMes } from '@/services/fluxoCaixa'

export const comissoesService = {
  /** Lista de comissões. Vendedor recebe apenas as próprias (regra do backend). */
  async listar(filtros: FiltrosComissoes = {}): Promise<Comissao[]> {
    const partes: string[] = ["status != 'cancelada'"]
    if (filtros.vendedor) partes.push(`vendedor = "${filtros.vendedor}"`)
    if (filtros.status === 'prevista') partes.push(`status = 'prevista'`)
    if (filtros.status === 'paga') partes.push(`status = 'paga'`)
    return (await pb.collection('comissoes').getFullList({
      filter: partes.join(' && '),
      sort: '-created',
      expand: 'vendedor',
      $cancelKey: 'comissoes-lista',
    })) as unknown as Comissao[]
  },

  /** Marca a comissão como paga (admin). */
  async marcarPaga(id: string, dataPagamento: string): Promise<Comissao> {
    return (await pb.collection('comissoes').update(id, {
      status: 'paga',
      data_pagamento: dataPagamento,
    })) as unknown as Comissao
  },

  /** Estorna: volta a prevista e limpa a data de pagamento (admin). */
  async estornar(id: string): Promise<Comissao> {
    return (await pb.collection('comissoes').update(id, {
      status: 'prevista',
      data_pagamento: null,
    })) as unknown as Comissao
  },
}

// ---------------------------------------------------------------------------
// DRE Simplificado
// ---------------------------------------------------------------------------

export interface LinhaDRE {
  rotulo: string
  valor: number
  tipo: 'receita' | 'custo' | 'despesa' | 'comissao' | 'resultado' | 'margem'
}

export interface DREMensal {
  ano: number
  mes: number
  receitaBruta: number
  custoProdutos: number
  despesas: number
  comissoes: number
  resultado: number
  margemPercentual: number
  linhas: LinhaDRE[]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Primeiro e último dia do mês em 'YYYY-MM-DD 00:00:00' (formato PocketBase). */
function limitesMes(ano: number, mes: number): { inicio: string; fim: string } {
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return {
    inicio: `${ano}-${pad(mes)}-01 00:00:00`,
    fim: `${ano}-${pad(mes)}-${pad(ultimoDia)} 00:00:00`,
  }
}

function mesDeData(dataISO?: string): number {
  if (!dataISO) return -1
  const d = new Date(dataISO)
  if (isNaN(d.getTime())) return -1
  return chaveMes(d.getFullYear(), d.getMonth() + 1)
}

/**
 * Custo consolidado dos BOMs por proposta, sobre a hierarquia ANINHADA:
 * UMA listagem única de bom_items (agrupada), UMA de boms, contexto de custo
 * e explosão recursiva por BOM (montarArvore + calcularCustoConsolidado) —
 * um item fabricado cujo código é o SKU de outro BOM resolve o custo pela
 * sub-lista daquele BOM (sub-BOM), com proteção de ciclo. Assim o custo dos
 * produtos vendidos inclui os itens das sub-listas, não só os diretos.
 */
export async function custoConsolidadoPorProposta(
  propostaIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (propostaIds.length === 0) return map

  let boms: Bom[] = []
  let itensGrouped: Record<string, BomItem[]> = {}
  try {
    const [bomsData, grouped] = await Promise.all([
      pb.collection('boms').getFullList({ $cancelKey: 'dre-boms' }),
      pb.collection('bom_items').getFullList({
        sort: 'bom_id,ordem,created',
        $cancelKey: 'dre-bom-items',
      }),
    ])
    boms = bomsData as unknown as Bom[]
    itensGrouped = {}
    for (const it of grouped as unknown as BomItem[]) {
      if (!itensGrouped[it.bom_id]) itensGrouped[it.bom_id] = []
      itensGrouped[it.bom_id].push(it)
    }
  } catch (err) {
    console.warn('DRE: falha ao listar boms/bom_items — custo dos produtos vendidos = 0.', err)
    return map
  }

  // Custo consolidado por BOM, recursivo entre BOMs (sub-BOMs) e memoizado
  // pelo contexto — um BOM é explodido uma única vez mesmo citado em vários.
  const ctx = montarContextoCusto(itensGrouped, boms)
  const custoPorBom = new Map<string, number>()
  for (const bom of boms) {
    const itens = itensGrouped[bom.id] || []
    if (itens.length === 0) continue
    const arvore = montarArvore(bom, itens)
    custoPorBom.set(bom.id, calcularCustoConsolidado(arvore.root, ctx))
  }

  // bom_id → proposta_id: 1 listagem única de proposta_items filtrada.
  const filtro = propostaIds.map((id) => `proposta_id = "${id}"`).join(' || ')
  try {
    const vinculos = await pb.collection('proposta_items').getFullList({
      filter: filtro,
      fields: 'proposta_id,bom_id',
      $cancelKey: 'dre-proposta-items',
    })
    for (const v of vinculos) {
      const bomId = (v as Record<string, unknown>).bom_id as string
      if (!bomId) continue
      const custo = custoPorBom.get(bomId) || 0
      map.set(v.proposta_id, (map.get(v.proposta_id) || 0) + custo)
    }
  } catch (err) {
    console.warn('DRE: falha ao listar proposta_items — custo dos produtos vendidos = 0.', err)
  }
  return map
}

/**
 * Monta o DRE do mês. Critérios (documentados no rodapé da página):
 * - Receita bruta: faturamentos com status 'emitido', pela data de emissão;
 * - CPV: custo consolidado dos BOMs das propostas das notas emitidas no mês;
 * - Despesas: contas_pagar por competência (vencimento) do mês, valor total;
 * - Comissões: comissões PAGAS com data_pagamento no mês + comissões PREVISTAS
 *   cuja proposta foi faturada (emitida) no mês.
 */
export async function calcularDREMensal(ano: number, mes: number): Promise<DREMensal> {
  const { inicio, fim } = limitesMes(ano, mes)
  const chave = chaveMes(ano, mes)

  // ---- Faturamentos emitidos no mês (data de emissão) ---------------------
  const faturamentos = (await pb.collection('faturamentos').getFullList({
    filter: `status = 'emitido' && data_emissao >= "${inicio}" && data_emissao <= "${fim}"`,
    sort: '-created',
    $cancelKey: 'dre-faturamentos',
  })) as unknown as Faturamento[]

  const receitaBruta = faturamentos.reduce((s, f) => s + (Number(f.valor_total) || 0), 0)

  // ---- CPV: propostas das notas emitidas no mês ---------------------------
  const propostaIds = Array.from(new Set(faturamentos.map((f) => f.proposta).filter(Boolean)))
  const custoPorProposta = await custoConsolidadoPorProposta(propostaIds as string[])
  const custoProdutos = propostaIds.reduce((s, pid) => s + (custoPorProposta.get(pid) || 0), 0)

  // ---- Despesas: contas_pagar por competência (vencimento) ----------------
  const contasPagar = (await pb.collection('contas_pagar').getFullList({
    filter: "status != 'cancelado'",
    sort: 'vencimento',
    $cancelKey: 'dre-contas-pagar',
  })) as unknown as Array<{ vencimento: string; valor: number; valor_pago: number }>
  const despesas = contasPagar
    .filter((c) => mesDeData(c.vencimento) === chave)
    .reduce((s, c) => s + (Number(c.valor) || 0), 0)

  // ---- Comissões ----------------------------------------------------------
  const comissoesTodas = (await pb.collection('comissoes').getFullList({
    filter: "status != 'cancelada'",
    $cancelKey: 'dre-comissoes',
  })) as unknown as Array<{
    proposta: string
    valor: number
    status: string
    data_pagamento?: string
  }>

  const faturadasNoMes = new Set(propostaIds as string[])
  let totalComissoes = 0
  for (const c of comissoesTodas) {
    const valor = Number(c.valor) || 0
    if (c.status === 'paga') {
      if (mesDeData(c.data_pagamento) === chave) totalComissoes += valor
    } else if (c.status === 'prevista' && faturadasNoMes.has(c.proposta)) {
      totalComissoes += valor
    }
  }

  const resultado = receitaBruta - custoProdutos - despesas - totalComissoes
  const margemPercentual = receitaBruta > 0 ? (resultado / receitaBruta) * 100 : 0

  const linhas: LinhaDRE[] = [
    { rotulo: '(+) Receita bruta', valor: receitaBruta, tipo: 'receita' },
    {
      rotulo: '(-) Custo dos produtos vendidos (CPV)',
      valor: custoProdutos,
      tipo: 'custo',
    },
    { rotulo: '(-) Despesas (competência)', valor: despesas, tipo: 'despesa' },
    { rotulo: '(-) Comissões', valor: totalComissoes, tipo: 'comissao' },
    { rotulo: '(=) Resultado do mês', valor: resultado, tipo: 'resultado' },
    { rotulo: 'Margem (%)', valor: margemPercentual, tipo: 'margem' },
  ]

  return {
    ano,
    mes,
    receitaBruta,
    custoProdutos,
    despesas,
    comissoes: totalComissoes,
    resultado,
    margemPercentual,
    linhas,
  }
}
