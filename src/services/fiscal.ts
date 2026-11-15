import pb from '@/lib/pocketbase/client'
import { parametrosService } from '@/services/parametros'
import type { Empresa, EmpresaInput, Faturamento, ImpostosEstimados, Parametro } from '@/types/erp'

/**
 * Módulo Fiscal (F1 — impostos estimados por regime; F2 — CFOP e CEST).
 * Regras de negócio no backend (pocketbase/hooks/fiscal.pb.js, rota custom
 * /backend/v1/custom/fiscal/impostos via pb.send); este serviço só orquestra.
 */

const COLLECTION_EMPRESA = 'empresa'

/** Resposta do hook fiscal — F1 (impostos) + F2 (CFOP e ST). */
export interface RespostaFiscal extends ImpostosEstimados {
  /** CFOP sugerido: 5.102/6.102 (ou 5.405/6.405 com substituição tributária). */
  cfop?: string
  mesma_uf?: boolean
  uf_empresa?: string
  /** Algum item tem NCM sujeito a substituição tributária. */
  st?: boolean
  /** Itens com ST: [{ sku, ncm }]. */
  st_itens?: Array<{ sku: string; ncm: string }>
  /** CEST por SKU (quando preenchido no cadastro do produto). */
  cest?: Record<string, string>
  /** CEST sugerido para itens de ST. */
  cest_sugerido?: string
}

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

  /** Impostos + CFOP de um faturamento — cálculo no backend (hook fiscal.pb.js). */
  async calcularImpostos(faturamentoId: string): Promise<RespostaFiscal> {
    const res = await pb.send('/backend/v1/custom/fiscal/impostos', {
      method: 'POST',
      body: { faturamento: faturamentoId },
    })
    return res as unknown as RespostaFiscal
  },

  /** Parâmetros fiscais (chaves fiscal_*) — editáveis pelo admin. */
  async listarParametrosFiscais(): Promise<Parametro[]> {
    const todos = await parametrosService.getAll()
    return todos.filter((p) => p.chave.startsWith('fiscal_'))
  },

  /** Lista de NCMs sujeitos a substituição tributária (parametro fiscal_st_ncm). */
  async getListaStNcm(): Promise<string[]> {
    try {
      const rec = await pb
        .collection('parametros')
        .getFirstListItem<Parametro>("chave = 'fiscal_st_ncm'")
      return (rec.valor_texto || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } catch {
      return ['8418.50.90']
    }
  },
}
