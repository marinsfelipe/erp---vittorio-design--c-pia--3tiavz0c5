import pb from '@/lib/pocketbase/client'
import type { OrdemCompra, OrdemCompraItem, Proposta } from '@/types/erp'

interface Consolidado {
  codigo: string
  descricao: string
  categoria: string
  unidade: string
  fornecedor: string
  quantidade: number
  custo_unitario: number
  custo_total: number
}

/**
 * Explode o BOM de cada proposta vendida ainda pendente de compra,
 * consolidando por código de componente (ignorando linhas de submontagem
 * agrupadoras, mesma lógica da ListaCompras).
 */
async function consolidarComponentesPendentes(): Promise<Consolidado[]> {
  const propostasVendidas = await pb
    .collection('propostas')
    .getFullList<Proposta>({ filter: "status = 'vendida'" })

  const mapa = new Map<string, Consolidado>()

  for (const proposta of propostasVendidas) {
    const itensProposta = await pb
      .collection('proposta_items')
      .getFullList<{ bom_id: string; quantidade: number }>({
        filter: `proposta_id = '${proposta.id.replace(/'/g, "\\'")}'`,
      })

    for (const item of itensProposta) {
      const bomItems = await pb.collection('bom_items').getFullList<{
        codigo: string
        descricao: string
        categoria?: string
        unidade: string
        fornecedor?: string
        quantidade: number
        custo_unitario: number
        item_tipo?: string
        tipo_linha?: string
      }>({ filter: `bom_id = '${item.bom_id.replace(/'/g, "\\'")}'` })

      for (const bi of bomItems) {
        // Na árvore multi-nível, apenas itens de terceiros (comprados) geram compra.
        // Itens sem item_tipo (legado pré-migração) caem na regra antiga de submontagem.
        if (bi.item_tipo) {
          if (bi.item_tipo !== 'componente_terceiros') continue
        } else if (
          bi.tipo_linha === 'submontagem' &&
          (!bi.custo_unitario || bi.custo_unitario === 0)
        ) {
          continue
        }
        const codigo = (bi.codigo || 'SEM-COD').trim()
        const fornecedor = (bi.fornecedor || 'Fornecedor Não Definido').trim()
        const qtd = (Number(bi.quantidade) || 0) * (Number(item.quantidade) || 0)
        const custoUnit = Number(bi.custo_unitario) || 0

        const existing = mapa.get(codigo)
        if (existing) {
          existing.quantidade += qtd
          existing.custo_total = existing.quantidade * existing.custo_unitario
        } else {
          mapa.set(codigo, {
            codigo,
            descricao: bi.descricao,
            categoria: bi.categoria || 'Geral',
            unidade: bi.unidade || 'UN',
            fornecedor,
            quantidade: qtd,
            custo_unitario: custoUnit,
            custo_total: qtd * custoUnit,
          })
        }
      }
    }
  }

  return Array.from(mapa.values()).sort((a, b) => a.codigo.localeCompare(b.codigo))
}

export const ordensCompraService = {
  async getAll(): Promise<OrdemCompra[]> {
    return await pb.collection('ordens_compra').getFullList<OrdemCompra>({
      sort: '-created',
    })
  },

  async getById(id: string): Promise<OrdemCompra> {
    return await pb.collection('ordens_compra').getOne<OrdemCompra>(id)
  },

  async getItems(ordemId: string): Promise<OrdemCompraItem[]> {
    return await pb.collection('ordem_compra_itens').getFullList<OrdemCompraItem>({
      filter: `ordem_id = '${ordemId.replace(/'/g, "\\'")}'`,
      sort: 'codigo',
    })
  },

  /**
   * Gera uma ordem de compra agregada com TODOS os componentes ainda
   * pendentes de compra das propostas vendidas. Se já existir uma ordem
   * aberta (pendente/parcial), ela é substituída pela nova consolidação —
   * itens já marcados como comprados NÃO voltam a aparecer.
   */
  async gerarOrdemParaPropostaVendida(): Promise<OrdemCompra> {
    const consolidados = await consolidarComponentesPendentes()

    // Procura uma ordem já existente em aberto para substituir
    const abertas = await pb
      .collection('ordens_compra')
      .getFullList<OrdemCompra>({ filter: "status != 'concluida'" })

    if (abertas.length > 0) {
      // Recria a ordem aberta mais antiga com a consolidação atual
      const ordem = abertas[0]
      const antigos = await this.getItems(ordem.id)
      for (const antigo of antigos) {
        if (antigo.comprado) continue // não reaparece: já foi comprado
        await pb.collection('ordem_compra_itens').delete(antigo.id)
      }
      let novoTotal = 0
      for (const c of consolidados) {
        await pb.collection('ordem_compra_itens').create<OrdemCompraItem>({
          ordem_id: ordem.id,
          codigo: c.codigo,
          descricao: c.descricao,
          categoria: c.categoria,
          unidade: c.unidade,
          fornecedor: c.fornecedor,
          quantidade: c.quantidade,
          custo_unitario: c.custo_unitario,
          custo_total: c.custo_total,
          comprado: false,
        })
        novoTotal += c.custo_total
      }
      return await pb.collection('ordens_compra').update<OrdemCompra>(ordem.id, {
        status: 'pendente',
        custo_total: novoTotal,
      })
    }

    // Sem ordem aberta: cria uma nova
    let novoTotal = 0
    const ordem = await pb.collection('ordens_compra').create<OrdemCompra>({
      numero: '',
      status: 'pendente',
      custo_total: 0,
      proposta_id: '',
    })
    for (const c of consolidados) {
      await pb.collection('ordem_compra_itens').create<OrdemCompraItem>({
        ordem_id: ordem.id,
        codigo: c.codigo,
        descricao: c.descricao,
        categoria: c.categoria,
        unidade: c.unidade,
        fornecedor: c.fornecedor,
        quantidade: c.quantidade,
        custo_unitario: c.custo_unitario,
        custo_total: c.custo_total,
        comprado: false,
      })
      novoTotal += c.custo_total
    }
    return await pb.collection('ordens_compra').update<OrdemCompra>(ordem.id, {
      custo_total: novoTotal,
    })
  },

  async marcarItemComprado(itemId: string, comprado: boolean): Promise<OrdemCompraItem> {
    const item = await pb
      .collection('ordem_compra_itens')
      .update<OrdemCompraItem>(itemId, { comprado })
    await this.recalcularStatusOrdem(item.ordem_id)
    return item
  },

  async recalcularStatusOrdem(ordemId: string): Promise<OrdemCompra> {
    const itens = await this.getItems(ordemId)
    const total = itens.length
    const comprados = itens.filter((i) => i.comprado).length
    const custoTotal = itens.reduce((acc, i) => acc + (Number(i.custo_total) || 0), 0)
    const status =
      total === 0 || comprados === 0 ? 'pendente' : comprados === total ? 'concluida' : 'parcial'
    return await pb.collection('ordens_compra').update<OrdemCompra>(ordemId, {
      status,
      custo_total: custoTotal,
    })
  },
}
