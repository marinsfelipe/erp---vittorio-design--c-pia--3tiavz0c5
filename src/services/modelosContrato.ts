import pb from '@/lib/pocketbase/client'
import type { ModeloContrato, ModeloContratoInput } from '@/types/erp'

export const modelosContratoService = {
  async getAll(): Promise<ModeloContrato[]> {
    return await pb.collection('modelos_contrato').getFullList<ModeloContrato>({
      sort: '-padrao,-created',
    })
  },

  async getAtivos(): Promise<ModeloContrato[]> {
    return await pb.collection('modelos_contrato').getFullList<ModeloContrato>({
      filter: 'ativo = true',
      sort: '-padrao,-created',
    })
  },

  async getById(id: string): Promise<ModeloContrato> {
    return await pb.collection('modelos_contrato').getOne<ModeloContrato>(id)
  },

  async create(data: ModeloContratoInput): Promise<ModeloContrato> {
    return await pb.collection('modelos_contrato').create<ModeloContrato>({
      ...data,
      criador: pb.authStore.record?.id,
    })
  },

  async update(id: string, data: Partial<ModeloContratoInput>): Promise<ModeloContrato> {
    return await pb.collection('modelos_contrato').update<ModeloContrato>(id, data)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('modelos_contrato').delete(id)
  },

  async setPadrao(id: string): Promise<void> {
    // Desmarca outros modelos como padrão e marca o selecionado
    const todos = await this.getAll()
    for (const m of todos) {
      if (m.padrao && m.id !== id) {
        await pb.collection('modelos_contrato').update(m.id, { padrao: false })
      }
    }
    await pb.collection('modelos_contrato').update(id, { padrao: true, ativo: true })
  },
}
