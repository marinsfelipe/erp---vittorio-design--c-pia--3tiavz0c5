import { useState } from 'react'
import type { Bom } from '@/types/erp'
import { LABEL_STATUS_NCM } from '@/types/erp'
import { ncmService } from '@/services/ncm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Pencil, Sparkles, CircleAlert } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Célula de NCM para a listagem de produtos finais (Tabela de Preços e Catálogo):
 * mostra o NCM gravado, o badge de origem (Manual / Automática) e a justificativa
 * (a palavra-chave/regra que casou, quando Automática).
 * O admin também pode preencher o NCM MANUALMENTE a qualquer momento — gravação
 * com origem "Manual", nunca sobrescrita pelas regras.
 */
export default function NcmCell({
  bom,
  podeAdmin,
  onChanged,
}: {
  bom: Bom
  podeAdmin: boolean
  onChanged: () => void
}) {
  const [salvando, setSalvando] = useState(false)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [valor, setValor] = useState('')

  const ncm = (bom.ncm || '').replace(/\D/g, '')
  const origem = bom.ncm_origem || ''

  const definirManual = async () => {
    if (!valor || valor.replace(/\D/g, '').length !== 8) {
      toast.error('Informe o NCM com exatamente 8 dígitos.')
      return
    }
    setSalvando(true)
    try {
      await ncmService.definirManual(bom.id, valor)
      toast.success(`NCM manual salvo para ${bom.sku}.`)
      setDialogAberto(false)
      setValor('')
      onChanged()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar o NCM.')
    } finally {
      setSalvando(false)
    }
  }

  const badgeOrigem = () => {
    if (origem === 'manual')
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40"
        >
          Manual
        </Badge>
      )
    if (origem === 'automatica')
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-700 bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:bg-violet-950/40"
        >
          <Sparkles className="h-2.5 w-2.5" /> Automática
        </Badge>
      )
    return null
  }

  const badgeStatus = () => {
    const st = bom.ncm_status || ''
    if (!st) return null
    if (st === 'pronto_nf')
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-sky-300 text-sky-700 bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:bg-sky-950/40"
        >
          {LABEL_STATUS_NCM.pronto_nf}
        </Badge>
      )
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 border-rose-300 text-rose-700 bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:bg-rose-950/40"
      >
        {LABEL_STATUS_NCM.pendente_fiscal}
      </Badge>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        {ncm ? (
          <span className="font-mono text-xs font-bold text-foreground">
            {ncm.slice(0, 4)}.{ncm.slice(4, 6)}.{ncm.slice(6)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {badgeOrigem()}
        {badgeStatus()}
      </div>

      {origem === 'automatica' && bom.ncm_justificativa && (
        <span className="text-[10px] text-muted-foreground leading-tight max-w-[240px]">
          {bom.ncm_justificativa}
        </span>
      )}

      {!ncm && (bom.ncm_status || '') === 'pendente_fiscal' && (
        <span className="text-[10px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
          <CircleAlert className="h-3 w-3" /> Sem regra aplicável
        </span>
      )}

      {/* Preenchimento manual: admin define/edita o NCM a qualquer momento */}
      {podeAdmin && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          disabled={salvando}
          onClick={() => {
            setValor(ncm)
            setDialogAberto(true)
          }}
        >
          <Pencil className="h-3 w-3" /> {ncm ? 'Editar NCM' : 'Definir NCM'}
        </Button>
      )}

      {/* Diálogo de NCM manual (definir/alterar) */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>NCM manual</DialogTitle>
            <DialogDescription>
              Produto <strong className="font-mono">{bom.sku}</strong> — {bom.nome} (fica com origem
              Manual — as regras automáticas nunca sobrescrevem).
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Ex: 84185010"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className="font-mono"
            inputMode="numeric"
            maxLength={8}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            O NCM deve conter exatamente 8 dígitos numéricos.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={definirManual} disabled={salvando}>
              Salvar NCM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
