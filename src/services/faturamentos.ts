import pb from '@/lib/pocketbase/client'
import type { Faturamento, FaturamentoStatus } from '@/types/erp'

/** Payload de criação de faturamento (sem campos gerados pelo backend). */
export type FaturamentoInput = Omit<Faturamento, 'id' | 'created' | 'updated' | 'expand'>

const esc = (v: string) => v.replace(/'/g, "\\'")

/**
 * Garante que o campo JSON produtos seja retornado como array estruturado
 */
function normalizarFaturamento(rec: any): Faturamento {
  let produtos = rec.produtos
  if (typeof produtos === 'string') {
    try {
      produtos = JSON.parse(produtos)
    } catch {
      produtos = []
    }
  }
  if (!Array.isArray(produtos)) {
    produtos = []
  }

  return {
    ...rec,
    produtos,
  } as Faturamento
}

export const faturamentosService = {
  async getAll(): Promise<Faturamento[]> {
    const list = await pb.collection('faturamentos').getFullList({
      sort: '-created',
      expand: 'proposta,cliente,criador',
    })
    return list.map(normalizarFaturamento)
  },

  async getById(id: string): Promise<Faturamento> {
    const rec = await pb.collection('faturamentos').getOne(id, {
      expand: 'proposta,cliente,criador',
    })
    return normalizarFaturamento(rec)
  },

  async getByProposta(propostaId: string): Promise<Faturamento[]> {
    const list = await pb.collection('faturamentos').getFullList({
      filter: `proposta = '${esc(propostaId)}'`,
      sort: '-created',
      expand: 'proposta,cliente,criador',
    })
    return list.map(normalizarFaturamento)
  },

  /**
   * Obtém o próximo número sequencial de faturamento para o ano informado.
   * Formato padrão: FT-AAAA-NNNN (ex: FT-2026-0001)
   */
  async getProximoNumero(
    ano?: number,
  ): Promise<{ numero: string; ano: number; sequencial: number }> {
    const anoAtual = ano || new Date().getFullYear()

    try {
      const ultimos = await pb.collection('faturamentos').getList(1, 1, {
        filter: `ano = ${anoAtual}`,
        sort: '-sequencial',
      })

      const ultimoSeq = (ultimos.items[0] as any)?.sequencial || 0
      const proximoSeq = ultimoSeq + 1
      const seqFormatado = String(proximoSeq).padStart(4, '0')
      const numero = `FT-${anoAtual}-${seqFormatado}`

      return {
        numero,
        ano: anoAtual,
        sequencial: proximoSeq,
      }
    } catch (err) {
      console.warn('Erro ao consultar sequencial de faturamento, iniciando em 1:', err)
      const seqFormatado = String(1).padStart(4, '0')
      return {
        numero: `FT-${anoAtual}-${seqFormatado}`,
        ano: anoAtual,
        sequencial: 1,
      }
    }
  },

  async create(
    data: Omit<FaturamentoInput, 'criador'> & { criador?: string },
  ): Promise<Faturamento> {
    const criadorId = data.criador || pb.authStore.record?.id || ''
    const rec = await pb.collection('faturamentos').create({
      ...data,
      criador: criadorId,
    })
    return normalizarFaturamento(rec)
  },

  async updateStatus(
    id: string,
    status: FaturamentoStatus,
    dataEmissao?: string,
  ): Promise<Faturamento> {
    const payload: { status: FaturamentoStatus; data_emissao?: string | null } = { status }
    if (status === 'emitido') {
      // Se não passou data, usa a data atual YYYY-MM-DD
      payload.data_emissao = dataEmissao || new Date().toISOString().split('T')[0]
    } else {
      payload.data_emissao = null
    }

    const rec = await pb.collection('faturamentos').update(id, payload)
    return normalizarFaturamento(rec)
  },

  /** Fiscal F2 — atualização parcial de campos (ex.: cfop, produtos com cest). */
  async update(id: string, data: Partial<FaturamentoInput>): Promise<Faturamento> {
    const rec = await pb.collection('faturamentos').update(id, data)
    return normalizarFaturamento(rec)
  },

  /**
   * Fiscal F3 — Lança/corrige os dados da NF emitida pelo contador
   * (número, série, data e valor total da nota) e marca o faturamento
   * como 'emitido'. Passar nf_numero vazio desfaz o lançamento.
   */
  async lancarNf(
    id: string,
    dados: {
      nf_numero: string
      nf_serie: string
      nf_data_emissao: string
      nf_valor: number
    },
  ): Promise<Faturamento> {
    const nfNumero = (dados.nf_numero || '').trim()
    const rec = await pb.collection('faturamentos').update(id, {
      nf_numero: nfNumero,
      nf_serie: (dados.nf_serie || '').trim(),
      nf_data_emissao: nfNumero ? dados.nf_data_emissao || null : null,
      nf_valor: nfNumero ? Number(dados.nf_valor) || 0 : null,
      status: 'emitido',
      // data_emissao acompanha a emissão real da NF quando houver
      data_emissao: nfNumero ? dados.nf_data_emissao || null : null,
    })
    return normalizarFaturamento(rec)
  },

  /** Fiscal F3 — NF emitida foi lançada para este faturamento? */
  nfLancada(f: Pick<Faturamento, 'nf_numero' | 'status'>): boolean {
    return f.status === 'emitido' && !!(f.nf_numero && f.nf_numero.trim())
  },

  /** Fiscal F3 — Desfaz o lançamento da NF (volta para 'pendente', limpa nf_*). */
  async desfazerNf(id: string): Promise<Faturamento> {
    const rec = await pb.collection('faturamentos').update(id, {
      nf_numero: '',
      nf_serie: '',
      nf_data_emissao: null,
      nf_valor: null,
      status: 'pendente',
      data_emissao: null,
    })
    return normalizarFaturamento(rec)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('faturamentos').delete(id)
  },
}
