import pb from '@/lib/pocketbase/client'
import type { Cliente, ClienteInput } from '@/types/erp'

const esc = (v: string) => v.replace(/'/g, "\\'")

export const clientesService = {
  async getAll(): Promise<Cliente[]> {
    // O backend (RLS) já filtra: admin vê todos, vendedor vê apenas os seus.
    return await pb.collection('clientes').getFullList<Cliente>({
      sort: '-created',
      expand: 'criador',
    })
  },

  async getById(id: string): Promise<Cliente> {
    return await pb.collection('clientes').getOne<Cliente>(id, { expand: 'criador' })
  },

  async create(data: ClienteInput): Promise<Cliente> {
    return await pb.collection('clientes').create<Cliente>(data)
  },

  async update(id: string, data: Partial<ClienteInput>): Promise<Cliente> {
    return await pb.collection('clientes').update<Cliente>(id, data)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('clientes').delete(id)
  },

  /** Conta quantos clientes o próprio vendedor já cadastrou. */
  async countProprios(): Promise<number> {
    return await pb
      .collection('clientes')
      .getFullList<Cliente>({
        filter: `criador = '${esc(pb.authStore.record?.id ?? '')}'`,
      })
      .then((l) => l.length)
  },
}
