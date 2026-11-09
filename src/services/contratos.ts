import pb from '@/lib/pocketbase/client'
import type { Contrato, ContratoInput } from '@/types/erp'

const esc = (v: string) => v.replace(/'/g, "\\'")

export const contratosService = {
  async getAll(): Promise<Contrato[]> {
    return await pb.collection('contratos').getFullList<Contrato>({
      sort: '-created',
      expand: 'proposta,cliente,modelo,criador',
    })
  },

  async getById(id: string): Promise<Contrato> {
    return await pb.collection('contratos').getOne<Contrato>(id, {
      expand: 'proposta,cliente,modelo,criador',
    })
  },

  async getByProposta(propostaId: string): Promise<Contrato[]> {
    return await pb.collection('contratos').getFullList<Contrato>({
      filter: `proposta = '${esc(propostaId)}'`,
      sort: '-created',
      expand: 'proposta,cliente,modelo,criador',
    })
  },

  async getByClienteNome(clienteNome: string): Promise<Contrato[]> {
    return await pb.collection('contratos').getFullList<Contrato>({
      filter: `cliente_nome = '${esc(clienteNome)}'`,
      sort: '-created',
      expand: 'proposta,cliente,modelo,criador',
    })
  },

  async getByClienteId(clienteId: string): Promise<Contrato[]> {
    return await pb.collection('contratos').getFullList<Contrato>({
      filter: `cliente = '${esc(clienteId)}'`,
      sort: '-created',
      expand: 'proposta,cliente,modelo,criador',
    })
  },

  /**
   * Obtém o próximo número sequencial de contrato para o ano informado.
   * Formato padrão: CT-AAAA-NNNN (ex: CT-2026-0001)
   */
  async getProximoNumero(
    ano?: number,
  ): Promise<{ numero: string; ano: number; sequencial: number }> {
    const anoAtual = ano || new Date().getFullYear()

    try {
      // Busca contratos do ano ordenados pelo sequencial decrescente
      const ultimos = await pb.collection('contratos').getList<Contrato>(1, 1, {
        filter: `ano = ${anoAtual}`,
        sort: '-sequencial',
      })

      const ultimoSeq = ultimos.items[0]?.sequencial || 0
      const proximoSeq = ultimoSeq + 1
      const seqFormatado = String(proximoSeq).padStart(4, '0')
      const numero = `CT-${anoAtual}-${seqFormatado}`

      return {
        numero,
        ano: anoAtual,
        sequencial: proximoSeq,
      }
    } catch (err) {
      console.warn('Erro ao consultar sequencial de contratos, iniciando em 1:', err)
      const seqFormatado = String(1).padStart(4, '0')
      return {
        numero: `CT-${anoAtual}-${seqFormatado}`,
        ano: anoAtual,
        sequencial: 1,
      }
    }
  },

  async create(data: Omit<ContratoInput, 'criador'> & { criador?: string }): Promise<Contrato> {
    const criadorId = data.criador || pb.authStore.record?.id || ''
    return await pb.collection('contratos').create<Contrato>({
      ...data,
      criador: criadorId,
    })
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('contratos').delete(id)
  },
}
