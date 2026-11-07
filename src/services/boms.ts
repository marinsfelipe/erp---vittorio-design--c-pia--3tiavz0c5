import pb from '@/lib/pocketbase/client'
import type { Bom, BomItem } from '@/types/erp'
import { montarArvore, calcularCustoConsolidado } from '@/utils/bomTree'

export const bomsService = {
  async getAll(): Promise<Bom[]> {
    return await pb.collection('boms').getFullList<Bom>({
      sort: 'sku',
    })
  },

  async getById(id: string): Promise<Bom> {
    return await pb.collection('boms').getOne<Bom>(id)
  },

  async create(data: Omit<Bom, 'id' | 'created' | 'updated'>): Promise<Bom> {
    return await pb.collection('boms').create<Bom>(data)
  },

  async update(id: string, data: Partial<Omit<Bom, 'id' | 'created' | 'updated'>>): Promise<Bom> {
    return await pb.collection('boms').update<Bom>(id, data)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('boms').delete(id)
  },

  // Itens do BOM
  async getItems(bomId: string): Promise<BomItem[]> {
    return await pb.collection('bom_items').getFullList<BomItem>({
      filter: `bom_id = '${bomId.replace(/'/g, "\\'")}'`,
      sort: 'ordem,created',
    })
  },

  async createItem(item: Omit<BomItem, 'id' | 'created' | 'updated'>): Promise<BomItem> {
    return await pb.collection('bom_items').create<BomItem>(item)
  },

  async updateItem(
    id: string,
    item: Partial<Omit<BomItem, 'id' | 'created' | 'updated'>>,
  ): Promise<BomItem> {
    return await pb.collection('bom_items').update<BomItem>(id, item)
  },

  async deleteItem(id: string): Promise<boolean> {
    return await pb.collection('bom_items').delete(id)
  },

  /** Exclui um item e todos os seus descendentes (subárvore). */
  async deleteItemCascade(id: string): Promise<number> {
    const item = await pb.collection('bom_items').getOne<BomItem>(id)
    const todos = await this.getItems(item.bom_id)
    const descendants = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const it of todos) {
        if (it.parent_id && descendants.has(it.parent_id) && !descendants.has(it.id)) {
          descendants.add(it.id)
          changed = true
        }
      }
    }
    let count = 0
    // Excluir filhos antes dos pais
    for (const d of Array.from(descendants).reverse()) {
      await this.deleteItem(d)
      count++
    }
    return count
  },

  /**
   * Salva toda a árvore do BOM. Para itens novos (id temporário), resolve o
   * parent_id depois da criação, garantindo que o pai tenha id real primeiro.
   */
  async saveAllItems(
    bomId: string,
    items: Array<Omit<BomItem, 'created' | 'updated'>>,
  ): Promise<void> {
    const existing = await this.getItems(bomId)
    const existingMap = new Map(existing.map((it) => [it.id, it]))
    const keptIds = new Set<string>()
    const idMap = new Map<string, string>() // id temporário -> id real

    // Ordenar por profundidade para criar pais antes dos filhos
    const depthOf = new Map<string, number>()
    const calcDepth = (it: (typeof items)[number], guard = 0): number => {
      if (!it.parent_id) return 0
      if (guard > 50) return 0
      if (depthOf.has(it.parent_id)) return depthOf.get(it.parent_id)! + 1
      const pai = items.find((o) => o.id === it.parent_id)
      return pai ? calcDepth(pai, guard + 1) + 1 : 0
    }
    items.forEach((it) => depthOf.set(it.id, calcDepth(it)))
    const ordenados = [...items].sort((a, b) => (depthOf.get(a.id) ?? 0) - (depthOf.get(b.id) ?? 0))

    for (const it of ordenados) {
      const parentRealId = it.parent_id ? idMap.get(it.parent_id) || it.parent_id : ''

      const payload: Omit<BomItem, 'id' | 'created' | 'updated'> = {
        bom_id: bomId,
        componente_id: it.componente_id || '',
        nivel: it.nivel ?? (parentRealId ? 2 : 1),
        ordem: it.ordem ?? 0,
        codigo: it.codigo,
        descricao: it.descricao,
        categoria: it.categoria || '',
        unidade: it.unidade || 'UN',
        quantidade: Number(it.quantidade) || 0,
        custo_unitario: Number(it.custo_unitario) || 0,
        fornecedor: it.fornecedor || '',
        tipo_linha: it.tipo_linha || 'componente',
        item_tipo: it.item_tipo,
        parent_id: parentRealId,
      }

      let realId = it.id
      if (it.id && existingMap.has(it.id)) {
        keptIds.add(it.id)
        await this.updateItem(it.id, payload)
      } else {
        const created = await this.createItem(payload)
        realId = created.id
        keptIds.add(created.id)
      }
      if (it.id) idMap.set(it.id, realId)
    }

    // Excluir os removidos (filhos antes dos pais)
    for (const old of [...existing].reverse()) {
      if (!keptIds.has(old.id)) {
        await this.deleteItem(old.id)
      }
    }
  },
}
