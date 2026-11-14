import { useEffect, useRef, useState } from 'react'
import { ncmService, type ProgressoNcm, type ResumoNcm } from '@/services/ncm'
import type { Bom } from '@/types/erp'
import { LABEL_ORIGEM_NCM } from '@/types/erp'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, CircleAlert } from 'lucide-react'
import { toast } from 'sonner'

interface ClassificarNcmLoteButtonProps {
  boms: Bom[]
  onConcluido: () => void
  /** Se falso, mostra apenas a sugestão (catálogo do vendedor). */
  podeAdmin: boolean
}

/**
 * Botão "Classificar NCMs pendentes" (exclusivo do admin) + diálogo com
 * indicador de progresso e resumo final do lote de classificação de NCM (IA).
 */
export default function ClassificarNcmLoteButton({
  boms,
  onConcluido,
  podeAdmin,
}: ClassificarNcmLoteButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [progresso, setProgresso] = useState<ProgressoNcm | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rodandoRef = useRef(false)

  const limparTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    return () => limparTimer()
  }, [])

  const iniciarPolling = () => {
    limparTimer()
    rodandoRef.current = true
    timerRef.current = setInterval(async () => {
      try {
        const p = await ncmService.progresso()
        setProgresso(p)
        if (p.estado === 'concluido' || p.estado === 'erro') {
          limparTimer()
          rodandoRef.current = false
          if (p.estado === 'concluido') {
            const resumo: ResumoNcm = {
              total: p.total,
              classificados_automaticamente: p.auto_alta,
              sugestoes_aguardando_confirmacao: p.sugestoes,
              sem_sugestao_confiavel: p.sem_sugestao,
              erros: p.erros,
            }
            toast.success(
              `Classificação concluída: ${resumo.classificados_automaticamente} automático(s), ` +
                `${resumo.sugestoes_aguardando_confirmacao} sugestão(ões) aguardando confirmação, ` +
                `${resumo.sem_sugestao_confiavel} sem sugestão confiável.`,
              { duration: 6000 },
            )
          } else {
            toast.error('Falha no processamento do lote de classificação de NCM.')
          }
          onConcluido()
        }
      } catch {
        // silencioso: próxima iteração tenta de novo
      }
    }, 1500)
  }

  const handleIniciar = async () => {
    const pendentes = boms.filter(
      (b) =>
        (b.ncm_origem || '') !== 'manual' &&
        ((b.ncm || '') === '' || b.ncm_status === 'pendente_fiscal'),
    )
    if (pendentes.length === 0) {
      toast.info('Nenhum produto pendente de classificação de NCM.')
      return
    }

    setIniciando(true)
    try {
      const resp = await ncmService.disparar()
      setProgresso({
        ok: true,
        estado: 'executando',
        total: resp.total,
        processados: 0,
        auto_alta: 0,
        sugestoes: 0,
        sem_sugestao: 0,
        erros: 0,
        mensagem: resp.mensagem,
      })
      setDialogOpen(true)
      iniciarPolling()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao iniciar classificação de NCMs.')
    } finally {
      setIniciando(false)
    }
  }

  const pct =
    progresso && progresso.total > 0
      ? Math.min(100, Math.round((progresso.processados / progresso.total) * 100))
      : 0

  const concluido = progresso?.estado === 'concluido'
  const emExecucao = progresso?.estado === 'executando'

  return (
    <>
      {podeAdmin && (
        <Button
          size="sm"
          variant="outline"
          className="gap-2 text-xs border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950"
          onClick={handleIniciar}
          disabled={iniciando || emExecucao}
        >
          {iniciando || emExecucao ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Classificar NCMs pendentes
        </Button>
      )}

      {/* Diálogo de progresso do lote */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (!emExecucao) setDialogOpen(v)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-600" />
              <DialogTitle>Classificação automática de NCM (IA)</DialogTitle>
            </div>
            <DialogDescription>
              A IA analisa descrição, categoria e componentes do BOM para sugerir o NCM de 8 dígitos
              de cada produto.
            </DialogDescription>
          </DialogHeader>

          {progresso && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {emExecucao && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {concluido ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : null}
                    {progresso.mensagem || (emExecucao ? 'Processando...' : '')}
                  </span>
                  <span className="font-mono">
                    {progresso.processados}/{progresso.total}
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>

              {concluido && (
                <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1.5 text-xs">
                  <p className="font-semibold text-foreground text-sm">Resumo do lote</p>
                  <div className="flex justify-between">
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Classificados automaticamente (confiança alta):
                    </span>
                    <strong className="font-mono">{progresso.auto_alta}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-700 dark:text-amber-400">
                      Sugestões aguardando confirmação:
                    </span>
                    <strong className="font-mono">{progresso.sugestoes}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-rose-700 dark:text-rose-400">
                      Sem sugestão confiável (continuam pendentes):
                    </span>
                    <strong className="font-mono">{progresso.sem_sugestao}</strong>
                  </div>
                  {progresso.erros > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Erros de processamento:</span>
                      <strong className="font-mono">{progresso.erros}</strong>
                    </div>
                  )}
                </div>
              )}

              {concluido && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setDialogOpen(false)}>
                    Concluir
                  </Button>
                  <Badge className="ml-2 hidden" variant="outline">
                    {LABEL_ORIGEM_NCM['automatica']}
                  </Badge>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
