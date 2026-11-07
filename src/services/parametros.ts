import pb from '@/lib/pocketbase/client'
import type { Parametro } from '@/types/erp'

export const parametrosService = {
  async getAll(): Promise<Parametro[]> {
    return await pb.collection('parametros').getFullList<Parametro>({
      sort: 'ordem,nome',
    })
  },

  async update(id: string, valor_percentual: number, descricao?: string): Promise<Parametro> {
    return await pb.collection('parametros').update<Parametro>(id, {
      valor_percentual,
      ...(descricao !== undefined ? { descricao } : {}),
    })
  },

  async create(data: Omit<Parametro, 'id' | 'created' | 'updated'>): Promise<Parametro> {
    return await pb.collection('parametros').create<Parametro>(data)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('parametros').delete(id)
  },

  async getMap(): Promise<Record<string, number>> {
    const list = await this.getAll()
    const map: Record<string, number> = {}
    for (const item of list) {
      map[item.chave] = item.valor_percentual
    }
    return map
  },
}
