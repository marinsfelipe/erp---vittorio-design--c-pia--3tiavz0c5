import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { XCircle } from 'lucide-react'

interface RecusarDescontoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propostaNumero?: string
  onConfirm: (motivo: string) => Promise<void>
  isSubmitting?: boolean
}

export function RecusarDescontoDialog({
  open,
  onOpenChange,
  propostaNumero,
  onConfirm,
  isSubmitting = false,
}: RecusarDescontoDialogProps) {
  const [motivo, setMotivo] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onConfirm(motivo)
    setMotivo('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <XCircle className="h-5 w-5" />
              <DialogTitle>Recusar Desconto Solicitado</DialogTitle>
            </div>
            <DialogDescription>
              O desconto geral da proposta {propostaNumero || ''} será zerado e o status retornará
              para a etapa comercial original para que o vendedor ajuste a proposta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="motivo-recusa-desconto" className="text-xs">
                Motivo / Justificativa da Recusa
              </Label>
              <Textarea
                id="motivo-recusa-desconto"
                rows={3}
                placeholder="Ex.: Margem insuficiente para este lote, conceder no máximo 5%..."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="text-xs"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? 'Recusando...' : 'Confirmar Recusa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
