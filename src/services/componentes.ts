import pb from '@/lib/pocketbase/client'
import type { Componente } from '@/types/erp'

export const componentesService = {
  async getAll(): Promise<Componente[]> {
    return await pb.collection('componentes').getFullList<Componente>({
      sort: 'codigo',
    })
  },

  async search(query: string, categoria?: string): Promise<Componente[]> {
    const filters: string[] = []
    if (query.trim()) {
      const q = query.trim().replace(/'/g, "\\'")
      filters.push(`(codigo ~ '${q}' || descricao ~ '${q}' || fornecedor ~ '${q}')`)
    }
    if (categoria && categoria !== 'todas') {
      filters.push(`categoria = '${categoria.replace(/'/g, "\\'")}'`)
    }

    return await pb.collection('componentes').getFullList<Componente>({
      filter: filters.length > 0 ? filters.join(' && ') : undefined,
      sort: 'codigo',
    })
  },

  async create(data: Omit<Componente, 'id' | 'created' | 'updated'>): Promise<Componente> {
    return await pb.collection('componentes').create<Componente>(data)
  },

  async update(
    id: string,
    data: Partial<Omit<Componente, 'id' | 'created' | 'updated'>>,
  ): Promise<Componente> {
    return await pb.collection('componentes').update<Componente>(id, data)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('componentes').delete(id)
  },

  async getByCodigo(codigo: string): Promise<Componente | null> {
    try {
      return await pb
        .collection('componentes')
        .getFirstListItem<Componente>(`codigo = '${codigo.replace(/'/g, "\\'")}'`)
    } catch {
      return null
    }
  },

  async importBatch(
    items: Array<Omit<Componente, 'id' | 'created' | 'updated'>>,
  ): Promise<{ created: number; updated: number; errors: number }> {
    let created = 0
    let updated = 0
    let errors = 0

    for (const item of items) {
      try {
        const existing = await this.getByCodigo(item.codigo)
        if (existing) {
          await this.update(existing.id, item)
          updated++
        } else {
          await this.create(item)
          created++
        }
      } catch (err) {
        console.error('Erro ao importar componente:', item.codigo, err)
        errors++
      }
    }

    return { created, updated, errors }
  },
}
