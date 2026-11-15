import pb from '@/lib/pocketbase/client'
import type { Bom } from '@/types/erp'

/**
 * Serviço de classificação de NCM por REGRAS FIXAS de palavras-chave
 * (sem IA). Rotas do hook `ncm_regras.pb.js`:
 *   POST /backend/v1/custom/ncm/classificar  — dispara o lote (admin)
 *   GET  /backend/v1/custom/ncm/progresso    — progresso/resumo (autenticado)
 *
 * Backfill dos BOMs existentes: migração 0021_ncm_backfill_regras.js
 * (aplicada; mesma lista de regras do hook — reexecutá-la não muda nada).
 */

export interface ProgressoNcm {
  ok: boolean
  estado: 'indefinido' | 'executando' | 'concluido' | 'erro' | string
  total: number
  processados: number
  classificados: number
  sem_regra: number
  manuais_preservados: number
  erros: number
  mensagem: string
}

export interface ResumoNcm {
  total: number
  classificados: number
  sem_regra: number
  manuais_preservados: number
  erros: number
}

export const ncmService = {
  /** Progresso atual do lote (GET, autenticado). */
  async progresso(): Promise<ProgressoNcm> {
    return await pb.send('/backend/v1/custom/ncm/progresso', { method: 'GET' })
  },

  /** Dispara o lote de classificação por regras (POST, admin). */
  async disparar(): Promise<{ ok: boolean; total: number; estado: string; mensagem?: string }> {
    return await pb.send('/backend/v1/custom/ncm/classificar', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },

  /** Confirma a sugestão pendente (célula de NCM) — mantido para compatibilidade. */
  async confirmar(bomId: string): Promise<Bom> {
    const rec = await pb.collection('boms').getOne(bomId)
    const sugerido = (rec as any).ncm_sugerido || ''
    return await pb.collection('boms').update(bomId, {
      ncm: sugerido,
      ncm_origem: 'manual',
      ncm_status: 'pronto_nf',
      ncm_sugerido: '',
      ncm_confianca: '',
    } as any)
  },

  /** Define o NCM manualmente (nunca sobrescrito pelas regras). */
  async definirManual(bomId: string, ncm: string): Promise<Bom> {
    return await pb.collection('boms').update(bomId, {
      ncm,
      ncm_origem: 'manual',
      ncm_status: 'pronto_nf',
      ncm_sugerido: '',
      ncm_confianca: '',
      ncm_justificativa: 'Preenchido manualmente',
    } as any)
  },

  /** Limpa (descarta) o NCM manual/sugestão do produto — volta a pendente fiscal. */
  async descartar(bomId: string): Promise<Bom> {
    return await pb.collection('boms').update(bomId, {
      ncm: '',
      ncm_origem: '',
      ncm_status: 'pendente_fiscal',
      ncm_sugerido: '',
      ncm_confianca: '',
      ncm_justificativa: '',
    } as any)
  },
}
