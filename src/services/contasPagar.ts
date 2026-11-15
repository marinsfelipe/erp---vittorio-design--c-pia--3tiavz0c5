// Service do Módulo Financeiro — Contas a Pagar (coleção contas_pagar).
// Uma única listagem (getFullList) para evitar rajadas de requests (rate limit 429).

import pb from '@/lib/pocketbase/client'
import type { BaixaContaPagarInput, ContaPagar } from '@/types/financeiro'

export const CHAVE_PRAZO_FORNECEDOR = 'financeiro_prazo_fornecedor'

export interface FiltrosContasPagar {
  fornecedor?: string
  status?: string
}

function montarFiltro(f: FiltrosContasPagar): string {
  const partes: string[] = ["status != 'cancelado'"]
  if (f.fornecedor) partes.push(`fornecedor ~ "${f.fornecedor}"`)
  if (f.status === 'atrasado') {
    partes.push(`status IN ('pendente','parcial') && vencimento < "${hojeISO()}"`)
  } else if (f.status === 'pago') {
    partes.push(`status = 'pago'`)
  } else if (f.status === 'parcial') {
    partes.push(`status = 'parcial' && vencimento >= "${hojeISO()}"`)
  } else if (f.status === 'pendente') {
    partes.push(`status = 'pendente' && vencimento >= "${hojeISO()}"`)
  }
  return partes.join(' && ')
}

function hojeISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 00:00:00`
}

export const contasPagarService = {
  async listar(filtros: FiltrosContasPagar = {}): Promise<ContaPagar[]> {
    return (await pb.collection('contas_pagar').getFullList({
      filter: montarFiltro(filtros),
      sort: 'vencimento,-created',
      $cancelKey: 'contas-pagar-lista',
    })) as unknown as ContaPagar[]
  },

  /** Baixa (parcial ou total) de uma conta — atualiza status/valor/data */
  async pagar(id: string, input: BaixaContaPagarInput): Promise<ContaPagar> {
    const atual = (await pb.collection('contas_pagar').getOne(id)) as unknown as ContaPagar
    const jaPago = Number(atual.valor_pago) || 0
    const novoPago = Math.round((jaPago + input.valor) * 100) / 100
    const total = Number(atual.valor) || 0
    const quitado = novoPago >= total - 0.005

    return (await pb.collection('contas_pagar').update(id, {
      valor_pago: novoPago,
      status: quitado ? 'pago' : 'parcial',
      data_pagamento: input.data_pagamento,
      forma_pagamento: input.forma_pagamento || atual.forma_pagamento,
      observacoes: input.observacao ? input.observacao : atual.observacoes,
    })) as unknown as ContaPagar
  },

  /** Lançamento avulso de despesa (aluguel, energia etc.) */
  async criarDespesa(input: {
    fornecedor: string
    descricao?: string
    categoria: string
    valor: number
    vencimento: string
    observacoes?: string
  }): Promise<ContaPagar> {
    return (await pb.collection('contas_pagar').create({
      ordem_compra: '',
      ordem_numero: '',
      fornecedor: input.fornecedor,
      descricao: input.descricao || '',
      categoria: input.categoria,
      valor: input.valor,
      valor_pago: 0,
      vencimento: input.vencimento,
      status: 'pendente',
      observacoes: input.observacoes || '',
    })) as unknown as ContaPagar
  },

  /** Edição dos campos editáveis da conta (vencimento, valor, categoria…) */
  async editar(
    id: string,
    input: Partial<{
      fornecedor: string
      descricao: string
      categoria: string
      valor: number
      vencimento: string
      observacoes: string
    }>,
  ): Promise<ContaPagar> {
    return (await pb.collection('contas_pagar').update(id, input)) as unknown as ContaPagar
  },

  /** Cancelamento da conta (mantém histórico, sai das listagens e dos totais) */
  async cancelar(id: string): Promise<void> {
    await pb.collection('contas_pagar').update(id, { status: 'cancelado' })
  },

  // ------------------------------------------------------------------
  // Prazo padrão de pagamento a fornecedores (coleção parametros)
  // ------------------------------------------------------------------
  async listarPrazoFornecedor(): Promise<{ id: string; dias: number }> {
    const r = (await pb
      .collection('parametros')
      .getFirstListItem(`chave = "${CHAVE_PRAZO_FORNECEDOR}"`, {
        $cancelKey: 'prazo-fornecedor',
      })) as unknown as { id: string; valor_percentual: number }
    return { id: r.id, dias: Number(r.valor_percentual) || 0 }
  },

  async salvarPrazoFornecedor(id: string, dias: number): Promise<void> {
    await pb.collection('parametros').update(id, { valor_percentual: dias })
  },
}
