// Service do Módulo Financeiro — agregações para Fluxo de Caixa, Dashboard e Alertas.
// TODAS as leituras usam getFullList únicos (sem rajada por registro — evita 429).

import pb from '@/lib/pocketbase/client'
import type { ContaPagar, ContaReceber } from '@/types/financeiro'

export interface MesFluxo {
  /** ano, 1..12 */
  ano: number
  mes: number
  entradas: number
  saidas: number
  saldo: number
  saldoAcumulado: number
}

export interface ResumoDashboard {
  /** Saldo pendente de contas_receber (o que falta receber) */
  totalAReceber: number
  /** Saldo pendente de contas_pagar (o que falta pagar) */
  totalAPagar: number
  /** Parcelas vencidas (atraso pelo vencimento) — valor em aberto */
  inadimplencia: number
  quantidadeAtrasadas: number
}

export interface ClienteTop {
  cliente_nome: string
  cliente_cnpj: string
  totalFaturado: number
  totalRecebido: number
}

export interface AlertasFinanceiros {
  vencendoEm7Dias: { quantidade: number; valor: number }
  vencidas: { quantidade: number; valor: number }
}

export type VisaoFluxo = 'realizada' | 'prevista'

const pad = (n: number) => String(n).padStart(2, '0')

function hojeZero(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** 'YYYY-MM-DD 00:00:00' no formato do PocketBase */
export function dataPB(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 00:00:00`
}

export function hojeISO(): string {
  return dataPB(hojeZero())
}

/** Chave do mês (ano*12 + mes-1) */
export function chaveMes(ano: number, mes: number): number {
  return ano * 12 + (mes - 1)
}

export function mesDeChave(chave: number): { ano: number; mes: number } {
  return { ano: Math.floor(chave / 12), mes: (chave % 12) + 1 }
}

function mesVencimento(conta: { vencimento: string }): number {
  const d = new Date(conta.vencimento)
  return chaveMes(d.getFullYear(), d.getMonth() + 1)
}

function mesBaixa(conta: { data_recebimento?: string; data_pagamento?: string }): number {
  const bruta = conta.data_recebimento || conta.data_pagamento || ''
  if (!bruta) return -1
  const d = new Date(bruta)
  if (isNaN(d.getTime())) return -1
  return chaveMes(d.getFullYear(), d.getMonth() + 1)
}

/** Contas a receber: baixa efetiva (recebido) por mês de data_recebimento */
export function entradasRealizadasPorMes(contas: ContaReceber[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const c of contas) {
    const valor = Number(c.valor_recebido) || 0
    if (valor <= 0) continue
    const m = mesBaixa(c)
    if (m < 0) continue
    map.set(m, (map.get(m) || 0) + valor)
  }
  return map
}

/** Contas a pagar: baixa efetiva (pago) por mês de data_pagamento */
export function saidasRealizadasPorMes(contas: ContaPagar[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const c of contas) {
    const valor = Number(c.valor_pago) || 0
    if (valor <= 0) continue
    const m = mesBaixa(c)
    if (m < 0) continue
    map.set(m, (map.get(m) || 0) + valor)
  }
  return map
}

/** Contas a receber: previsto (saldo em aberto) por mês de VENCIMENTO */
export function entradasPrevistasPorMes(contas: ContaReceber[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const c of contas) {
    if (c.status === 'cancelado') continue
    const saldo = Math.max(0, (Number(c.valor_parcela) || 0) - (Number(c.valor_recebido) || 0))
    if (saldo <= 0) continue
    const m = mesVencimento(c)
    map.set(m, (map.get(m) || 0) + saldo)
  }
  return map
}

/** Contas a pagar: previsto (saldo em aberto) por mês de VENCIMENTO */
export function saidasPrevistasPorMes(contas: ContaPagar[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const c of contas) {
    if (c.status === 'cancelado') continue
    const saldo = Math.max(0, (Number(c.valor) || 0) - (Number(c.valor_pago) || 0))
    if (saldo <= 0) continue
    const m = mesVencimento(c)
    map.set(m, (map.get(m) || 0) + saldo)
  }
  return map
}

function somarMeses(
  receitas: Map<number, number>,
  despesas: Map<number, number>,
  de: number,
  ate: number,
): MesFluxo[] {
  const meses: MesFluxo[] = []
  let acumulado = 0
  for (let c = de; c <= ate; c++) {
    const { ano, mes } = mesDeChave(c)
    const entradas = receitas.get(c) || 0
    const saidas = despesas.get(c) || 0
    const saldo = entradas - saidas
    acumulado += saldo
    meses.push({ ano, mes, entradas, saidas, saldo, saldoAcumulado: acumulado })
  }
  return meses
}

/** Fluxo REALIZADO do ano: baixas por data de recebimento/pagamento */
export function fluxoRealizado(
  receitas: Map<number, number>,
  despesas: Map<number, number>,
  ano: number,
): MesFluxo[] {
  return somarMeses(receitas, despesas, ano * 12, ano * 12 + 11)
}

/** Fluxo PREVISTO do ano: saldos em aberto por vencimento */
export function fluxoPrevisto(
  receitas: Map<number, number>,
  despesas: Map<number, number>,
  ano: number,
): MesFluxo[] {
  return somarMeses(receitas, despesas, ano * 12, ano * 12 + 11)
}

// ---------------------------------------------------------------------------
// Leituras únicas das coleções (sem filtros: agregação feita no cliente)
// ---------------------------------------------------------------------------

export const fluxoCaixaService = {
  /** Uma única listagem de contas_receber */
  async listarReceber(): Promise<ContaReceber[]> {
    return (await pb.collection('contas_receber').getFullList({
      filter: "status != 'cancelado'",
      sort: 'vencimento',
      $cancelKey: 'fluxo-receber',
    })) as unknown as ContaReceber[]
  },

  /** Uma única listagem de contas_pagar */
  async listarPagar(): Promise<ContaPagar[]> {
    return (await pb.collection('contas_pagar').getFullList({
      filter: "status != 'cancelado'",
      sort: 'vencimento',
      $cancelKey: 'fluxo-pagar',
    })) as unknown as ContaPagar[]
  },

  async listarTudo(): Promise<{ receber: ContaReceber[]; pagar: ContaPagar[] }> {
    const [receber, pagar] = await Promise.all([this.listarReceber(), this.listarPagar()])
    return { receber, pagar }
  },

  // ------------------------------ agregações ------------------------------

  resumoDashboard(receber: ContaReceber[], pagar: ContaPagar[]): ResumoDashboard {
    const hoje = hojeZero()
    let totalAReceber = 0
    let totalAPagar = 0
    let inadimplencia = 0
    let quantidadeAtrasadas = 0

    for (const c of receber) {
      const saldo = Math.max(0, (Number(c.valor_parcela) || 0) - (Number(c.valor_recebido) || 0))
      if (c.status === 'pago') continue
      totalAReceber += saldo
      const venc = new Date(c.vencimento)
      venc.setHours(0, 0, 0, 0)
      if (venc < hoje) {
        inadimplencia += saldo
        quantidadeAtrasadas++
      }
    }
    for (const c of pagar) {
      if (c.status === 'pago') continue
      totalAPagar += Math.max(0, (Number(c.valor) || 0) - (Number(c.valor_pago) || 0))
    }
    return { totalAReceber, totalAPagar, inadimplencia, quantidadeAtrasadas }
  },

  top5Clientes(receber: ContaReceber[]): ClienteTop[] {
    const porCliente = new Map<string, ClienteTop>()
    for (const c of receber) {
      const nome = c.cliente_nome || '—'
      if (!porCliente.has(nome)) {
        porCliente.set(nome, {
          cliente_nome: nome,
          cliente_cnpj: c.cliente_cnpj || '',
          totalFaturado: 0,
          totalRecebido: 0,
        })
      }
      const item = porCliente.get(nome)!
      item.totalFaturado += Number(c.valor_parcela) || 0
      item.totalRecebido += Number(c.valor_recebido) || 0
    }
    return Array.from(porCliente.values())
      .sort((a, b) => b.totalFaturado - a.totalFaturado)
      .slice(0, 5)
  },

  alertas(receber: ContaReceber[], pagar: ContaPagar[]): AlertasFinanceiros {
    const hoje = hojeZero()
    const limite = new Date(hoje)
    limite.setDate(limite.getDate() + 7)
    const res: AlertasFinanceiros = {
      vencendoEm7Dias: { quantidade: 0, valor: 0 },
      vencidas: { quantidade: 0, valor: 0 },
    }
    const acumula = (c: { vencimento: string; status: string }, saldo: number) => {
      if (c.status === 'pago' || c.status === 'cancelado') return
      const venc = new Date(c.vencimento)
      venc.setHours(0, 0, 0, 0)
      if (saldo <= 0) return
      if (venc < hoje) {
        res.vencidas.quantidade++
        res.vencidas.valor += saldo
      } else if (venc <= limite) {
        res.vencendoEm7Dias.quantidade++
        res.vencendoEm7Dias.valor += saldo
      }
    }
    for (const c of receber) {
      acumula(c, Math.max(0, (Number(c.valor_parcela) || 0) - (Number(c.valor_recebido) || 0)))
    }
    for (const c of pagar) {
      acumula(c, Math.max(0, (Number(c.valor) || 0) - (Number(c.valor_pago) || 0)))
    }
    return res
  },
}
