import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { ncmService, type ProgressoNcm, type ResumoNcm } from '@/services/ncm'
import { Label } from '@/components/ui/label'
import { Sparkles } from 'lucide-react'
import type { Bom } from '@/types/erp'

interface ClassificarNcmLoteButtonProps {
  boms: Bom[]
  onConcluido: () => void
  podeAdmin: boolean
}

/**
 * Botão "Aplicar regras de NCM" (exclusivo do admin) + diálogo com barra de
 * progresso e resumo final do lote de classificação de NCM por REGRAS FIXAS
 * de palavras-chave (sem IA).
 *
 * Regras (primeira que casar): refrigerador, freezer, mobiliário, vitrine
 * aquecida/estufa, vitrine neutra, cocção. Produtos com NCM manual nunca são
 * sobrescritos.
 */
export default function ClassificarNcmLoteButton({
  boms,
  onConcluido,
  podeAdmin,
}: ClassificarNcmLoteButtonProps) {
  const [dialogAberto, setDialogAberto] = useState(false)
  const [progresso, setProgresso] = useState<ProgressoNcm | null>(null)
  const [resumo, setResumo] = useState<ResumoNcm | null>(null)
  const [executando, setExecutando] = useState(false)
  const intervaloRef = useRef<number | null>(null)

  const pararPolling = () => {
    if (intervaloRef.current !== null) {
      window.clearInterval(intervaloRef.current)
      intervaloRef.current = null
    }
  }

  useEffect(() => {
    return () => pararPolling()
  }, [])

  const iniciarPolling = () => {
    pararPolling()
    intervaloRef.current = window.setInterval(async () => {
      try {
        const p = await ncmService.progresso()
        setProgresso(p)
        if (p.estado === 'concluido' || p.estado === 'erro') {
          pararPolling()
          setExecutando(false)
          if (p.estado === 'concluido') {
            const r: ResumoNcm = {
              total: p.total,
              classificados: p.classificados,
              sem_regra: p.sem_regra,
              manuais_preservados: p.manuais_preservados,
              erros: p.erros,
            }
            setResumo(r)
            toast.success(
              `Classificação concluída: ${r.classificados} classificado(s), ${r.sem_regra} sem regra aplicável, ${r.manuais_preservados} manual(is) preservado(s).`,
            )
          } else {
            toast.error('Falha no processamento do lote de classificação de NCM.')
          }
          onConcluido()
        }
      } catch {
        // falha transitória de rede: tenta de novo no próximo tick
      }
    }, 1500)
  }

  const executar = async () => {
    const pendentes = boms.filter(
      (b) =>
        (b.ncm_origem || '') !== 'manual' &&
        ((b.ncm || '') === '' || b.ncm_status === 'pendente_fiscal'),
    )
    if (pendentes.length === 0) {
      toast.info('Nenhum produto pendente de classificação de NCM.')
      return
    }
    setResumo(null)
    setProgresso({
      ok: true,
      estado: 'executando',
      total: pendentes.length,
      processados: 0,
      classificados: 0,
      sem_regra: 0,
      manuais_preservados: 0,
      erros: 0,
      mensagem: 'Iniciando...',
    })
    setDialogAberto(true)
    setExecutando(true)
    try {
      await ncmService.disparar()
      iniciarPolling()
    } catch (err: any) {
      setExecutando(false)
      pararPolling()
      toast.error(err?.message || 'Erro ao iniciar a aplicação das regras de NCM.')
    }
  }

  if (!podeAdmin) return null

  const pct =
    progresso && progresso.total > 0
      ? Math.min(100, Math.round((progresso.processados / progresso.total) * 100))
      : 0

  return (
    <>
      <Button size="sm" className="gap-2 text-xs" onClick={executar} disabled={executando}>
        <Sparkles className={`h-3.5 w-3.5 ${executando ? 'animate-pulse' : ''}`} />
        Aplicar regras de NCM
      </Button>

      <Dialog open={dialogAberto} onOpenChange={(o) => !executando && setDialogAberto(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aplicar regras de NCM</DialogTitle>
            <DialogDescription>
              Classificação em lote pelas regras fixas de palavras-chave (refrigerador, freezer,
              mobiliário, vitrine aquecida/estufa, vitrine neutra, cocção). NCM preenchido
              manualmente nunca é sobrescrito.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!resumo ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Label>Progresso do lote</Label>
                    <span className="text-muted-foreground font-mono">
                      {progresso?.processados || 0} / {progresso?.total || 0}
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progresso?.mensagem || 'Aguarde...'}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md border border-border p-2">
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {progresso?.classificados ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Classificados</p>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <p className="font-semibold text-amber-600 dark:text-amber-400">
                      {progresso?.sem_regra ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Sem regra</p>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <p className="font-semibold text-blue-600 dark:text-blue-400">
                      {progresso?.manuais_preservados ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Manuais preservados</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Resumo final</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border p-3">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {resumo.classificados}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Classificados por regra</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                      {resumo.sem_regra}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Sem regra aplicável</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {resumo.manuais_preservados}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Manuais preservados</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-lg font-bold text-muted-foreground">{resumo.erros}</p>
                    <p className="text-[11px] text-muted-foreground">Erros</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
