import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle, XCircle } from 'lucide-react'

interface MotivoPerdaDialogProps {
  open: boolean
  propostaNumero?: string
  cliente?: string
  motivo: string
  isSubmitting?: boolean
  onChangeMotivo: (val: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export const MotivoPerdaDialog: React.FC<MotivoPerdaDialogProps> = ({
  open,
  propostaNumero,
  cliente,
  motivo,
  isSubmitting = false,
  onChangeMotivo,
  onConfirm,
  onCancel,
}) => {
  const motivosSugeridos = [
    'Preço acima do concorrente',
    'Prazo de entrega inviável',
    'Cliente cancelou o projeto',
    'Sem retorno após follow-up',
    'Especificação técnica diferente',
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <XCircle className="h-5 w-5" />
            <DialogTitle>Registrar Motivo da Perda</DialogTitle>
          </div>
          <DialogDescription>
            {propostaNumero ? `Proposta ${propostaNumero}` : 'Proposta'}
            {cliente ? ` • Cliente: ${cliente}` : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="motivo-perda" className="text-xs font-semibold">
              Por que a proposta foi perdida? *
            </Label>
            <Textarea
              id="motivo-perda"
              placeholder="Ex.: Cliente optou por concorrente com preço 15% menor; projeto pausado por falta de orçamento..."
              rows={3}
              value={motivo}
              onChange={(e) => onChangeMotivo(e.target.value)}
              className="resize-none text-sm"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground block">
              Sugestões rápidas:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {motivosSugeridos.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => onChangeMotivo(sug)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={!motivo.trim() || isSubmitting}>
              {isSubmitting ? 'Gravando...' : 'Confirmar Perda'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
