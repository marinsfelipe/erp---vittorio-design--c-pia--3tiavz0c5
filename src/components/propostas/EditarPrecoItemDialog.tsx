import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { PropostaItem } from '@/types/erp'
import { formatBRL } from '@/utils/formatters'
import { Pencil, RotateCcw, AlertTriangle } from 'lucide-react'

interface EditarPrecoItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PropostaItem | null
  onConfirm: (novoPreco: number, justificativa?: string) => Promise<void>
  onRestaurar?: () => Promise<void>
  isSubmitting?: boolean
}

export function EditarPrecoItemDialog({
  open,
  onOpenChange,
  item,
  onConfirm,
  onRestaurar,
  isSubmitting = false,
}: EditarPrecoItemDialogProps) {
  const [valorTexto, setValorTexto] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const precoTabelaOriginal =
    item?.preco_original_tabela !== undefined &&
    item?.preco_original_tabela !== null &&
    Number(item.preco_original_tabela) > 0
      ? Number(item.preco_original_tabela)
      : Number(item?.preco_unitario || 0)

  useEffect(() => {
    if (item && open) {
      setValorTexto(item.preco_unitario ? String(item.preco_unitario) : '')
      setJustificativa('')
      setErro(null)
    }
  }, [item, open])

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item) return

    const num = Number(valorTexto.replace(',', '.'))
    if (isNaN(num) || num < 0) {
      setErro('Informe um valor de preço unitário válido (zero ou maior).')
      return
    }

    try {
      await onConfirm(num, justificativa.trim() || undefined)
    } catch (err: any) {
      setErro(err?.message || 'Erro ao atualizar preço.')
    }
  }

  const handleRestaurarOriginal = async () => {
    if (!onRestaurar) return
    try {
      await onRestaurar()
    } catch (err: any) {
      setErro(err?.message || 'Erro ao restaurar preço original.')
    }
  }

  if (!item) return null

  const valorDigitado = Number(valorTexto.replace(',', '.')) || 0
  const diferencaOriginal = valorDigitado - precoTabelaOriginal
  const foiEditado = Boolean(
    item.preco_editado ||
    (item.preco_original_tabela && item.preco_unitario !== item.preco_original_tabela),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Pencil className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">Editar Preço Unitário</DialogTitle>
              <DialogDescription className="text-xs">
                {item.sku} — {item.nome_produto}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSalvar} className="space-y-4 py-2">
          {/* Informações de Tabela e Histórico */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Preço Original de Tabela:</span>
              <span className="font-mono font-bold text-foreground">
                {formatBRL(precoTabelaOriginal)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Preço Unitário Atual:</span>
              <span className="font-mono font-medium">{formatBRL(item.preco_unitario)}</span>
            </div>

            {foiEditado && (
              <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300 text-[10px] gap-1"
                >
                  <Pencil className="h-2.5 w-2.5" />
                  Preço com edição direta
                </Badge>
                {onRestaurar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRestaurarOriginal}
                    disabled={isSubmitting}
                    className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restaurar tabela ({formatBRL(precoTabelaOriginal)})
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="novoPrecoUnitario" className="text-xs font-semibold">
              Novo Preço Unitário (R$)
            </Label>
            <Input
              id="novoPrecoUnitario"
              type="number"
              step="0.01"
              min="0"
              value={valorTexto}
              onChange={(e) => {
                setValorTexto(e.target.value)
                setErro(null)
              }}
              placeholder="0.00"
              className="font-mono text-base font-bold"
              required
              autoFocus
            />

            {valorDigitado > 0 && diferencaOriginal !== 0 && (
              <p className="text-[11px] text-muted-foreground flex items-center justify-between font-mono">
                <span>Variação em relação à tabela:</span>
                <span
                  className={
                    diferencaOriginal < 0
                      ? 'text-rose-600 font-semibold'
                      : 'text-emerald-600 font-semibold'
                  }
                >
                  {diferencaOriginal > 0 ? '+' : ''}
                  {formatBRL(diferencaOriginal)} (
                  {((diferencaOriginal / precoTabelaOriginal) * 100).toFixed(1)}%)
                </span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="justificativaPreco" className="text-xs font-semibold">
              Justificativa ou Observação (Opcional)
            </Label>
            <Input
              id="justificativaPreco"
              type="text"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex: Condição especial negociada, volume, alinhamento comercial"
              className="text-xs"
            />
          </div>

          {erro && (
            <div className="p-2.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              {isSubmitting ? 'Salvando...' : 'Salvar Preço'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
