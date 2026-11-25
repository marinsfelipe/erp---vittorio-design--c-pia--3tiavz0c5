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

  /**
   * Busca TODOS os itens de todos os BOMs em uma única listagem (paginada pelo
   * SDK) e agrupa por bom_id no cliente. Evita a rajada de 1 request por BOM
   * (Promise.all de getItems), que estoura o rate limit (429) do backend e
   * derruba o carregamento da página /boms.
   */
  async getAllItemsGrouped(): Promise<Record<string, BomItem[]>> {
    const todos = await pb.collection('bom_items').getFullList<BomItem>({
      sort: 'bom_id,ordem,created',
    })
    const map: Record<string, BomItem[]> = {}
    for (const it of todos) {
      const key = it.bom_id
      if (!map[key]) map[key] = []
      map[key].push(it)
    }
    return map
  },

  async create(data: Omit<Bom, 'id' | 'created' | 'updated'>): Promise<Bom> {
    return await pb.collection('boms').create<Bom>(data)
  },

  async getBySku(sku: string): Promise<Bom | null> {
    try {
      return await pb
        .collection('boms')
        .getFirstListItem<Bom>(`sku = '${sku.trim().replace(/'/g, "\\'")}'`)
    } catch {
      return null
    }
  },

  async update(id: string, data: Partial<Omit<Bom, 'id' | 'created' | 'updated'>>): Promise<Bom> {
    return await pb.collection('boms').update<Bom>(id, data)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('boms').delete(id)
  },

  /**
   * Edição em lote de BOMs: aplica os MESMOS valores a vários registros, um
   * update por vez EM SÉRIE (sem Promise.all — evita rate limit 429).
   * Aceita só os campos passados; retorna contagem de acertos/falhas.
   */
  async updateLote(
    ids: string[],
    valores: Partial<
      Pick<Bom, 'categoria' | 'ncm' | 'ncm_origem' | 'ncm_status' | 'ncm_classificado_em'>
    >,
  ): Promise<{ atualizados: number; erros: number }> {
    let atualizados = 0
    let erros = 0
    for (const id of ids) {
      try {
        await this.update(id, valores)
        atualizados++
      } catch (err) {
        console.error('Erro ao atualizar BOM em lote:', id, err)
        erros++
      }
    }
    return { atualizados, erros }
  },

  /**
   * Reaproveitar lista: copia os itens da BOM de ORIGEM para a BOM de DESTINO,
   * remapeando a hierarquia (parent_id) para o destino. A BOM de origem fica
   * INTACTA. Gravação EM SÉRIE (um create por vez, sem Promise.all — rajada de
   * requests estoura o rate limit 429 do backend e derruba a página).
   *
   * A raiz da origem (nivel 1, sem parent) NÃO é copiada: o destino já tem a
   * sua própria raiz (produto final / semi-acabado). Os filhos diretos da raiz
   * de origem passam a pendurar na raiz do destino (ou no topo do destino,
   * quando ele ainda não tem item raiz gravado).
   */
  async copiarLista(origemId: string, destinoId: string): Promise<{ itensCopiados: number }> {
    const [origem, destino] = await Promise.all([this.getItems(origemId), this.getItems(destinoId)])

    const raizOrigem = origem.find((it) => !it.parent_id) ?? null
    const raizDestino = destino.find((it) => !it.parent_id) ?? null

    // Criar pais antes dos filhos: ordena por profundidade na árvore da origem
    const prof = new Map<string, number>()
    const profundidade = (it: BomItem, guard = 0): number => {
      if (!it.parent_id) return 0
      if (guard > 50) return 0
      const pai = origem.find((o) => o.id === it.parent_id)
      if (!pai) return 0
      const p = prof.get(pai.id)
      if (p !== undefined) return p + 1
      return profundidade(pai, guard + 1) + 1
    }
    origem.forEach((it) => prof.set(it.id, profundidade(it)))
    const ordenados = [...origem].sort((a, b) => (prof.get(a.id) ?? 0) - (prof.get(b.id) ?? 0))

    const idMap = new Map<string, string>() // id do item na origem -> id criado no destino
    if (raizOrigem) idMap.set(raizOrigem.id, raizDestino?.id ?? '')

    let itensCopiados = 0
    for (const it of ordenados) {
      if (raizOrigem && it.id === raizOrigem.id) continue
      let parentId = ''
      if (it.parent_id) {
        parentId = idMap.get(it.parent_id) ?? ''
      } else if (raizDestino) {
        parentId = raizDestino.id
      }
      const criado = await this.createItem({
        bom_id: destinoId,
        componente_id: it.componente_id || '',
        nivel: it.nivel,
        ordem: it.ordem,
        codigo: it.codigo,
        descricao: it.descricao,
        categoria: it.categoria || '',
        unidade: it.unidade || 'UN',
        quantidade: Number(it.quantidade) || 0,
        custo_unitario: Number(it.custo_unitario) || 0,
        fornecedor: it.fornecedor || '',
        tipo_linha: it.tipo_linha || 'componente',
        item_tipo: it.item_tipo,
        parent_id: parentId,
      } as Omit<BomItem, 'id' | 'created' | 'updated'>)
      idMap.set(it.id, criado.id)
      itensCopiados++
    }
    return { itensCopiados }
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
      // parent_id só é enviado quando resolve para um id REAL de bom_items
      // (existente ou já criado nesta passada). Id temporário não resolvido —
      // por exemplo a raiz virtual "virtual-<bomId>" que a UI usa quando o BOM
      // ainda não tem item produto_final — é gravado como '' (o buildTree
      // pendura itens sem parent direto sob a raiz), pois o PocketBase rejeita
      // relação inválida com 400.
      let parentRealId = ''
      if (it.parent_id) {
        const resolvido = idMap.get(it.parent_id)
        if (resolvido) parentRealId = resolvido
        else if (existingMap.has(it.parent_id)) parentRealId = it.parent_id
      }

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
