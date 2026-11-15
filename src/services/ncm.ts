import pb from '@/lib/pocketbase/client'
import type { Bom } from '@/types/erp'
import { ClientResponseError } from 'pocketbase'

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

/**
 * As rotas /backend/v1/custom/** precisam ser chamadas via `pb.send` (que prefixa
 * o host correto do backend Skip Cloud e envia o token de autenticação) — um
 * `fetch` relativo cairia no host estático do app e retornaria 405.
 */

/** Extrai a mensagem legível de um erro do PocketBase (ClientResponseError) ou genérico. */
function mensagemErro(err: unknown, fallback: string): string {
  if (err instanceof ClientResponseError) {
    const detalhe = (err.response as any)?.message || (err.response as any)?.detail || ''
    return detalhe || err.message || fallback
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export const ncmService = {
  /** Dispara o lote de classificação (roda em segundo plano no backend). */
  async disparar(): Promise<{ ok: boolean; total: number; estado: string; mensagem: string }> {
    try {
      return (await pb.send('/backend/v1/custom/ncm/classificar', {
        method: 'POST',
        body: {},
      })) as { ok: boolean; total: number; estado: string; mensagem: string }
    } catch (err: unknown) {
      throw new Error(mensagemErro(err, 'Erro ao iniciar o lote de classificação de NCMs.'))
    }
  },

  /** Consulta progresso do lote (GET — método registrado no hook). */
  async progresso(): Promise<ProgressoNcm> {
    try {
      return (await pb.send('/backend/v1/custom/ncm/progresso', {
        method: 'GET',
      })) as ProgressoNcm
    } catch (err: unknown) {
      throw new Error(mensagemErro(err, 'Erro ao consultar o progresso da classificação.'))
    }
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
