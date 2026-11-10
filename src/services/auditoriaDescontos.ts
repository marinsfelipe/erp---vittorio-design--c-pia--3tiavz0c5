import pb from '@/lib/pocketbase/client'
import type { PropostaDescontoAuditoria } from '@/types/erp'

const esc = (v: string) => v.replace(/'/g, "\\'")

export const auditoriaDescontosService = {
  async getByProposta(propostaId: string): Promise<PropostaDescontoAuditoria[]> {
    try {
      const records = await pb.collection('proposta_desconto_auditoria').getFullList({
        filter: `proposta = '${esc(propostaId)}'`,
        sort: '-created',
        expand: 'usuario,proposta',
      })
      return records as unknown as PropostaDescontoAuditoria[]
    } catch (err: any) {
      // Se não for admin ou não houver registros, retorna vazio sem quebrar a tela
      console.warn('Erro ao carregar auditoria de descontos:', err?.message)
      return []
    }
  },

  async registrar(
    dados: Omit<PropostaDescontoAuditoria, 'id' | 'created' | 'updated'>,
  ): Promise<PropostaDescontoAuditoria | null> {
    try {
      const authUser = pb.authStore.record
      const payload = {
        ...dados,
        usuario: dados.usuario || authUser?.id || '',
        usuario_nome: dados.usuario_nome || authUser?.name || authUser?.email || 'Usuário',
        usuario_email: dados.usuario_email || authUser?.email || '',
      }
      const record = await pb.collection('proposta_desconto_auditoria').create(payload)
      return record as unknown as PropostaDescontoAuditoria
    } catch (err: any) {
      console.error('Erro ao gravar auditoria de desconto:', err)
      return null
    }
  },
}
