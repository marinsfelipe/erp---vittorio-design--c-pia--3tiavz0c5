// Service do Módulo Financeiro — Contas a Receber (coleção contas_receber).
// Uma única listagem (getFullList) para evitar rajadas de requests (rate limit 429).

import pb from '@/lib/pocketbase/client'
import type { BaixaParcelaInput, CondicaoPagamento, ContaReceber } from '@/types/financeiro'

export const CHAVES_CONDICOES = [
  'financeiro_condicao_avista',
  'financeiro_condicao_30',
  'financeiro_condicao_60',
  'financeiro_condicao_90',
  'financeiro_condicao_120',
] as const

export const ROTULO_CONDICOES: Record<string, string> = {
  financeiro_condicao_avista: 'À vista',
  financeiro_condicao_30: 'Parcelado 30 dias',
  financeiro_condicao_60: 'Parcelado 30/60 dias',
  financeiro_condicao_90: 'Parcelado 30/60/90 dias',
  financeiro_condicao_120: 'Parcelado 30/60/90/120 dias',
}

export interface FiltrosContasReceber {
  cliente?: string
  status?: string
  vencimentoDe?: string
  vencimentoAte?: string
}

function montarFiltro(f: FiltrosContasReceber): string {
  const partes: string[] = ["status != 'cancelado'"]
  if (f.cliente) partes.push(`cliente_nome ~ "${f.cliente}"`)
  if (f.status === 'atrasado') {
    partes.push(`status IN ('pendente','parcial') && vencimento < "${hojeISO()}"`)
  } else if (f.status === 'pago') {
    partes.push(`status = 'pago'`)
  } else if (f.status === 'parcial') {
    partes.push(`status = 'parcial' && vencimento >= "${hojeISO()}"`)
  } else if (f.status === 'pendente') {
    partes.push(`status = 'pendente' && vencimento >= "${hojeISO()}"`)
  }
  if (f.vencimentoDe) partes.push(`vencimento >= "${f.vencimentoDe}"`)
  if (f.vencimentoAte) partes.push(`vencimento <= "${f.vencimentoAte}"`)
  return partes.join(' && ')
}

function hojeISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 00:00:00`
}

export const contasReceberService = {
  async listar(filtros: FiltrosContasReceber = {}): Promise<ContaReceber[]> {
    return (await pb.collection('contas_receber').getFullList({
      filter: montarFiltro(filtros),
      sort: 'vencimento,-created',
      $cancelKey: 'contas-receber-lista',
    })) as unknown as ContaReceber[]
  },

  /** Baixa (parcial ou total) de uma parcela — atualiza status/valor/data */
  async receber(id: string, input: BaixaParcelaInput): Promise<ContaReceber> {
    const atual = (await pb.collection('contas_receber').getOne(id)) as unknown as ContaReceber
    const jaRecebido = Number(atual.valor_recebido) || 0
    const novoRecebido = Math.round((jaRecebido + input.valor) * 100) / 100
    const total = Number(atual.valor_parcela) || 0
    const quitado = novoRecebido >= total - 0.005

    return (await pb.collection('contas_receber').update(id, {
      valor_recebido: novoRecebido,
      status: quitado ? 'pago' : 'parcial',
      data_recebimento: input.data_pagamento,
      forma_pagamento: input.forma_pagamento || atual.forma_pagamento,
      observacoes: input.observacao ? input.observacao : atual.observacoes,
    })) as unknown as ContaReceber
  },

  // ------------------------------------------------------------------
  // Condições de pagamento (coleção `parametros`, chaves financeiro_*)
  // ------------------------------------------------------------------
  async listarCondicoes(): Promise<CondicaoPagamento[]> {
    const registros = await pb.collection('parametros').getFullList({
      filter: CHAVES_CONDICOES.map((c) => `chave = "${c}"`).join(' || '),
      sort: 'ordem',
      $cancelKey: 'condicoes-pagamento',
    })
    return registros.map((r) => ({
      id: r.id,
      chave: (r as Record<string, unknown>).chave as string,
      nome: ROTULO_CONDICOES[(r as Record<string, unknown>).chave as string] || '',
      dias: Number((r as Record<string, unknown>).valor_percentual) || 0,
      descricao: (r as Record<string, unknown>).descricao as string,
      created: (r as Record<string, unknown>).created as string,
      updated: (r as Record<string, unknown>).updated as string,
    }))
  },

  async salvarCondicao(condicao: CondicaoPagamento): Promise<void> {
    await pb.collection('parametros').update(condicao.id, {
      valor_percentual: condicao.dias,
    })
  },
}
