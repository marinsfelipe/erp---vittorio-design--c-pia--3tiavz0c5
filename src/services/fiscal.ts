import pb from '@/lib/pocketbase/client'
import { parametrosService } from '@/services/parametros'
import type { Empresa, EmpresaInput, Faturamento, ImpostosEstimados, Parametro } from '@/types/erp'

/**
 * Módulo Fiscal (Funcionalidade 1 — impostos estimados por regime).
 * Regras de negócio no backend (pocketbase/hooks/fiscal.pb.js, rota custom
 * /backend/v1/custom/fiscal/impostos via pb.send); este serviço só orquestra.
 */

const COLLECTION_EMPRESA = 'empresa'

export const fiscalService = {
  /** Cadastro da Empresa (1 registro, admin-only). */
  async getEmpresa(): Promise<Empresa | null> {
    const recs = await pb.collection(COLLECTION_EMPRESA).getList(1, 1)
    if (recs.items.length === 0) return null
    const r = recs.items[0]
    return {
      id: r.id,
      criador: r.get('criador') as string,
      razao_social: (r.get('razao_social') as string) || '',
      cnpj: (r.get('cnpj') as string) || '',
      ie: (r.get('ie') as string) || '',
      endereco: (r.get('endereco') as string) || '',
      cidade: (r.get('cidade') as string) || '',
      uf: (r.get('uf') as string) || '',
      email: (r.get('email') as string) || '',
      telefone: (r.get('telefone') as string) || '',
      regime: (r.get('regime') as Empresa['regime']) || 'simples',
      created: r.get('created') as string,
      updated: r.get('updated') as string,
    }
  },

  async saveEmpresa(input: EmpresaInput, id?: string): Promise<Empresa> {
    const dados = { ...input, criador: pb.authStore.record?.id || '' }
    if (id) {
      await pb.collection(COLLECTION_EMPRESA).update(id, dados)
      return (await fiscalService.getEmpresa()) as Empresa
    }
    await pb.collection(COLLECTION_EMPRESA).create(dados)
    return (await fiscalService.getEmpresa()) as Empresa
  },

  /** Impostos estimados de um faturamento — cálculo no backend (hook fiscal.pb.js). */
  async calcularImpostos(faturamentoId: string): Promise<ImpostosEstimados> {
    const res = await pb.send('/backend/v1/custom/fiscal/impostos', {
      method: 'POST',
      body: { faturamento: faturamentoId },
    })
    return res as unknown as ImpostosEstimados
  },

  /** Parâmetros fiscais (chaves fiscal_*) — editáveis pelo admin. */
  async listarParametrosFiscais(): Promise<Parametro[]> {
    const todos = await parametrosService.getAll()
    return todos.filter((p) => p.chave.startsWith('fiscal_'))
  },
}
