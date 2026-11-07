import pb from '@/lib/pocketbase/client'
import { calcularMarkupDivisor, montarPercentuais } from '@/utils/pricing'
import type { Proposta, PropostaItem, PropostaStatus, Bom, BomItem, Parametro } from '@/types/erp'

/** Snapshot estático dos dados do BOM usados na proposta (imune a mudanças futuras). */
export interface PropostaItemInput {
  bom_id: string
  sku: string
  nome_produto: string
  quantidade: number
  preco_unitario: number
  custo_unitario: number
}

/** Custo consolidado (soma qtd × custo unitário) dos componentes do BOM. */
export function calcularCustoConsolidado(items: BomItem[]): number {
  return items.reduce(
    (acc, it) => acc + (Number(it.quantidade) || 0) * (Number(it.custo_unitario) || 0),
    0,
  )
}

/** Monta o snapshot de itens da proposta a partir dos BOMs e parâmetros atuais. */
export async function montarItensProposta(
  selecoes: Array<{ bom: Bom; quantidade: number }>,
): Promise<PropostaItemInput[]> {
  const parametros = await pb.collection('parametros').getFullList<Parametro>({
    sort: 'ordem,nome',
  })
  const pMap: Record<string, number> = {}
  parametros.forEach((p) => {
    pMap[p.chave] = p.valor_percentual
  })
  const itens: PropostaItemInput[] = []
  for (const { bom, quantidade } of selecoes) {
    if (quantidade <= 0) continue
    const bomItems = await pb
      .collection('bom_items')
      .getFullList<BomItem>({ filter: `bom_id = '${bom.id.replace(/'/g, "\\'")}'` })
    const custo = calcularCustoConsolidado(bomItems)
    // Mesma fórmula da precificação: markup divisor com TODOS os percentuais
    // da tabela de parâmetros (com override de overhead/margem do SKU).
    const percentuais = montarPercentuais(pMap, {
      overhead: bom.overhead_percentual,
      margem: bom.margem_percentual,
    })
    const resultado = calcularMarkupDivisor(custo, percentuais)
    if (!resultado.valido) {
      throw new Error(resultado.erro ?? 'Parâmetro de precificação inválido.')
    }
    const precoVenda = resultado.precoVenda
    itens.push({
      bom_id: bom.id,
      sku: bom.sku,
      nome_produto: bom.nome,
      quantidade,
      preco_unitario: precoVenda,
      custo_unitario: custo,
    })
  }
  return itens
}

export const propostasService = {
  async getAll(): Promise<Proposta[]> {
    return await pb.collection('propostas').getFullList<Proposta>({
      sort: '-created',
    })
  },

  async getById(id: string): Promise<Proposta> {
    return await pb.collection('propostas').getOne<Proposta>(id)
  },

  async getItems(propostaId: string): Promise<PropostaItem[]> {
    return await pb.collection('proposta_items').getFullList<PropostaItem>({
      filter: `proposta_id = '${propostaId.replace(/'/g, "\\'")}'`,
      sort: 'created,sku',
    })
  },

  async create(
    cliente: string,
    observacoes: string,
    itens: PropostaItemInput[],
  ): Promise<Proposta> {
    const valorTotal = itens.reduce((acc, i) => acc + i.preco_unitario * i.quantidade, 0)
    const proposta = await pb.collection('propostas').create<Proposta>({
      cliente,
      status: 'rascunho',
      valor_total: valorTotal,
      observacoes,
    })
    for (const it of itens) {
      await pb.collection('proposta_items').create<PropostaItem>({
        proposta_id: proposta.id,
        bom_id: it.bom_id,
        sku: it.sku,
        nome_produto: it.nome_produto,
        quantidade: it.quantidade,
        preco_unitario: it.preco_unitario,
        custo_unitario: it.custo_unitario,
      })
    }
    return proposta
  },

  async updateStatus(id: string, status: PropostaStatus): Promise<Proposta> {
    return await pb.collection('propostas').update<Proposta>(id, { status })
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('propostas').delete(id)
  },
}
