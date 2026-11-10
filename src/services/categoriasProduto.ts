import pb from '@/lib/pocketbase/client'
import type { CategoriaProduto } from '@/types/erp'

export const categoriasProdutoService = {
  /**
   * Retorna todas as categorias ativas ordenadas por nome.
   */
  async getAll(): Promise<CategoriaProduto[]> {
    try {
      const records = await pb.collection('categorias_produto').getFullList<CategoriaProduto>({
        sort: 'nome',
      })
      return records
    } catch (err) {
      console.error('Erro ao buscar categorias de produto:', err)
      return []
    }
  },

  /**
   * Busca uma categoria existente por nome ignorando maiúsculas e minúsculas (case-insensitive).
   */
  async findByNameCaseInsensitive(nome: string): Promise<CategoriaProduto | null> {
    const limpo = nome.trim()
    if (!limpo) return null
    try {
      const all = await this.getAll()
      const match = all.find((c) => c.nome.trim().toLowerCase() === limpo.toLowerCase())
      return match || null
    } catch {
      return null
    }
  },

  /**
   * Cria uma nova categoria de produto.
   * Valida unicidade ignorando maiúsculas/minúsculas e impede se já existir.
   * Apenas administradores são autorizados pelas regras do backend.
   */
  async create(nome: string, descricao?: string): Promise<CategoriaProduto> {
    const nomeLimpo = nome.trim()
    if (!nomeLimpo) {
      throw new Error('O nome da categoria é obrigatório.')
    }

    // Validação case-insensitive
    const duplicada = await this.findByNameCaseInsensitive(nomeLimpo)
    if (duplicada) {
      throw new Error(`A categoria "${duplicada.nome}" já existe.`)
    }

    try {
      const created = await pb.collection('categorias_produto').create<CategoriaProduto>({
        nome: nomeLimpo,
        descricao: descricao?.trim() || '',
        ativo: true,
      })
      return created
    } catch (err: any) {
      // Se estourar unique constraint no banco
      const msg = err?.data?.data?.nome?.message || err?.message || ''
      if (
        msg.toLowerCase().includes('unique') ||
        msg.toLowerCase().includes('already') ||
        msg.toLowerCase().includes('exist')
      ) {
        throw new Error(`A categoria "${nomeLimpo}" já existe.`)
      }
      if (err?.status === 403) {
        throw new Error('Apenas administradores podem criar novas categorias de produto.')
      }
      throw new Error(msg || 'Erro ao criar categoria de produto.')
    }
  },
}
