import pb from '@/lib/pocketbase/client'
import type { Bom } from '@/types/erp'

/**
 * Serviço da classificação automática de NCM (IA, agentes nativos Skip Cloud).
 *
 * - `dispararClassificacao`: inicia o lote em segundo plano no backend.
 * - `progressoClassificacao`: consultado em polling para progresso + resumo.
 * - `confirmarSugestao` / `alterarSugestao` / `definirNcmManual`: ações do admin.
 *
 * A importação de NCM via planilha continua funcionando normalmente e grava
 * origem 'manual' — o que for executado por último prevalece.
 */

export interface ProgressoNcm {
  ok: boolean
  estado: 'indefinido' | 'executando' | 'concluido' | 'erro' | ''
  total: number
  processados: number
  auto_alta: number
  sugestoes: number
  sem_sugestao: number
  erros: number
  mensagem?: string
}

export interface ResumoNcm {
  total: number
  classificados_automaticamente: number
  sugestoes_aguardando_confirmacao: number
  sem_sugestao_confiavel: number
  erros?: number
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const token = pb.authStore.token
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify(body || {}),
  })
  const texto = await resp.text()
  let dados: any = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = null
  }
  if (!resp.ok) {
    const msg = (dados && (dados.message || dados.detail)) || `Erro ${resp.status}`
    throw new Error(msg)
  }
  return dados as T
}

export const ncmService = {
  /** Dispara o lote de classificação (roda em segundo plano no backend). */
  async disparar(): Promise<{ ok: boolean; total: number; estado: string; mensagem: string }> {
    return await postJson('/backend/v1/custom/ncm/classificar', {})
  },

  /** Consulta progresso do lote. */
  async progresso(): Promise<ProgressoNcm> {
    return await postJson('/backend/v1/custom/ncm/progresso', {})
  },

  /** Confirma sugestão de NCM (média/baixa) — vira NCM válido, origem 'manual'. */
  async confirmar(bomId: string): Promise<Bom> {
    const rec = await pb.collection('boms').getOne<Bom>(bomId)
    const sugerido = (rec as any).ncm_sugerido || ''
    const ncm = sugerido.replace(/\D/g, '')
    return await pb.collection('boms').update<Bom>(bomId, {
      ncm,
      ncm_origem: 'manual',
      ncm_status: 'pronto_nf',
      ncm_sugerido: '',
      ncm_confianca: '',
      ncm_justificativa: '',
      ncm_classificado_em: new Date().toISOString(),
    } as any)
  },

  /** Salva NCM alterado manualmente pelo admin (origem 'manual'). */
  async alterar(bomId: string, ncm: string): Promise<Bom> {
    const limpo = ncm.replace(/\D/g, '')
    if (limpo.length !== 8) throw new Error('O NCM deve conter exatamente 8 dígitos.')
    return await pb.collection('boms').update<Bom>(bomId, {
      ncm: limpo,
      ncm_origem: 'manual',
      ncm_status: 'pronto_nf',
      ncm_sugerido: '',
      ncm_confianca: '',
      ncm_justificativa: '',
      ncm_classificado_em: new Date().toISOString(),
    } as any)
  },

  /** Define NCM manualmente em qualquer produto (origem 'manual'). */
  async definirManual(bomId: string, ncm: string): Promise<Bom> {
    return await this.alterar(bomId, ncm)
  },

  /** Descarta uma sugestão pendente (produto volta a ficar sem NCM). */
  async descartar(bomId: string): Promise<Bom> {
    return await pb.collection('boms').update<Bom>(bomId, {
      ncm: '',
      ncm_origem: '',
      ncm_status: 'pendente_fiscal',
      ncm_sugerido: '',
      ncm_confianca: '',
      ncm_justificativa: '',
      ncm_classificado_em: new Date().toISOString(),
    } as any)
  },
}
