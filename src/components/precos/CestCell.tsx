import { useState } from 'react'
import type { Bom } from '@/types/erp'
import { bomsService } from '@/services/boms'
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
import { Pencil, Barcode } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Fiscal F2 — célula de CEST para a listagem de produtos finais (Tabela de
 * Preços e Catálogo), mesmo padrão do NcmCell: mostra o CEST gravado e abre
 * um diálogo de edição para o admin (campo opcional, formato XX.XXX.XX).
 */

/** Normaliza a entrada para o formato XX.XXX.XX (aceita 2100700 ou 21.007.00). */
export function formatarCest(entrada: string): string {
  const d = (entrada || '').replace(/\D/g, '').slice(0, 7)
  if (d.length <= 2) return d
  if (d.length <= 5) return d.slice(0, 2) + '.' + d.slice(2)
  return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5)
}

export default function CestCell({
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

  const cest = (bom.cest || '').trim()

  const salvar = async () => {
    const limpo = valor.replace(/\D/g, '')
    if (limpo && limpo.length !== 7) {
      toast.error('O CEST deve conter 7 dígitos no formato XX.XXX.XX.')
      return
    }
    setSalvando(true)
    try {
      await bomsService.update(bom.id, { cest: limpo ? formatarCest(limpo) : '' } as any)
      toast.success(cest ? 'CEST atualizado.' : 'CEST salvo.')
      setDialogAberto(false)
      onChanged()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar o CEST.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {cest ? (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-950/40 gap-1"
        >
          <Barcode className="h-2.5 w-2.5" />
          <span className="font-mono">{cest}</span>
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}

      {podeAdmin && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          disabled={salvando}
          onClick={() => {
            setValor(cest)
            setDialogAberto(true)
          }}
        >
          <Pencil className="h-3 w-3" /> {cest ? 'Editar CEST' : 'Definir CEST'}
        </Button>
      )}

      {/* Diálogo de CEST (definir/limpar) */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>CEST do produto</DialogTitle>
            <DialogDescription>
              Produto <strong className="font-mono">{bom.sku}</strong> — {bom.nome}. Campo opcional,
              formato XX.XXX.XX. Usado na preparação da NF quando o item é sujeito a substituição
              tributária.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Ex: 21.007.00"
            value={valor}
            onChange={(e) => setValor(formatarCest(e.target.value))}
            className="font-mono"
            maxLength={9}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            7 dígitos no formato XX.XXX.XX. Deixe vazio para remover o CEST do produto.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={salvando}>
              Salvar CEST
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
