import pb from '@/lib/pocketbase/client'
import type { PropostaPrecoAuditoria } from '@/types/erp'

const esc = (v: string) => v.replace(/'/g, "\\'")

export const auditoriaPrecosService = {
  async getByProposta(propostaId: string): Promise<PropostaPrecoAuditoria[]> {
    try {
      const records = await pb.collection('proposta_preco_auditoria').getFullList({
        filter: `proposta = '${esc(propostaId)}'`,
        sort: '-created',
        expand: 'usuario,proposta,item',
      })
      return records as unknown as PropostaPrecoAuditoria[]
    } catch (err: any) {
      console.warn('Erro ao carregar auditoria de preços:', err?.message)
      return []
    }
  },

  async registrar(
    dados: Omit<PropostaPrecoAuditoria, 'id' | 'created' | 'updated'>,
  ): Promise<PropostaPrecoAuditoria | null> {
    try {
      const authUser = pb.authStore.record
      const payload = {
        ...dados,
        usuario: dados.usuario || authUser?.id || '',
        usuario_nome: dados.usuario_nome || authUser?.name || authUser?.email || 'Usuário',
        usuario_email: dados.usuario_email || authUser?.email || '',
      }
      const record = await pb.collection('proposta_preco_auditoria').create(payload)
      return record as unknown as PropostaPrecoAuditoria
    } catch (err: any) {
      console.error('Erro ao gravar auditoria de preço:', err)
      return null
    }
  },
}
