import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { PropostaItem, DescontoTipo } from '@/types/erp'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { calcularDescontoItem } from '@/utils/descontos'
import { Percent, DollarSign, Tag, Info } from 'lucide-react'

interface AplicarDescontoItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PropostaItem | null
  onConfirm: (tipo: DescontoTipo, valor: number) => Promise<void>
  isSubmitting?: boolean
  limiteVendedor?: number
  isVendedor?: boolean
}

export function AplicarDescontoItemDialog({
  open,
  onOpenChange,
  item,
  onConfirm,
  isSubmitting = false,
  limiteVendedor = 10,
  isVendedor = false,
}: AplicarDescontoItemDialogProps) {
  const [tipo, setTipo] = useState<DescontoTipo>('percentual')
  const [valorInput, setValorInput] = useState<string>('')

  useEffect(() => {
    if (open && item) {
      setTipo(item.desconto_tipo || 'percentual')
      setValorInput(item.desconto_valor ? String(item.desconto_valor) : '')
    }
  }, [open, item])

  if (!item) return null

  const valorNumerico = Math.max(0, parseFloat(valorInput.replace(',', '.')) || 0)
  const calc = calcularDescontoItem({
    precoUnitario: item.preco_unitario,
    quantidade: item.quantidade,
    descontoTipo: tipo,
    descontoValor: valorNumerico,
  })

  const percentualEfetivo =
    item.preco_unitario > 0 ? (calc.descontoUnitario / item.preco_unitario) * 100 : 0
  const excedeLimiteVendedor = isVendedor && percentualEfetivo > limiteVendedor

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onConfirm(tipo, valorNumerico)
  }

  const handleRemoverDesconto = async () => {
    setValorInput('0')
    await onConfirm('valor', 0)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <DialogTitle>Desconto no Item</DialogTitle>
            </div>
            <DialogDescription>
              Aplique desconto em valor (R$) ou percentual (%) sobre o preço unitário deste SKU.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Resumo do SKU */}
            <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{item.sku}</span>
                <span className="text-muted-foreground">
                  {item.quantidade} {item.unidade || 'UN'}
                </span>
              </div>
              <p className="text-muted-foreground truncate">{item.nome_produto}</p>
              <div className="flex items-center justify-between pt-1 border-t border-border/50 font-mono">
                <span className="text-muted-foreground">Preço Original:</span>
                <span className="font-medium text-foreground">
                  {formatBRL(item.preco_unitario)}/un
                </span>
              </div>
            </div>

            {/* Alternância Tipo: R$ ou % */}
            <div className="space-y-1.5">
              <Label className="text-xs">Formato do Desconto</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={tipo === 'percentual' ? 'default' : 'outline'}
                  size="sm"
                  className="gap-2 text-xs"
                  onClick={() => setTipo('percentual')}
                >
                  <Percent className="h-3.5 w-3.5" />
                  Percentual (%)
                </Button>
                <Button
                  type="button"
                  variant={tipo === 'valor' ? 'default' : 'outline'}
                  size="sm"
                  className="gap-2 text-xs"
                  onClick={() => setTipo('valor')}
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Valor Direto (R$)
                </Button>
              </div>
            </div>

            {/* Input de Valor */}
            <div className="space-y-1.5">
              <Label htmlFor="desconto-item-input" className="text-xs">
                {tipo === 'percentual'
                  ? 'Percentual de Desconto (%)'
                  : 'Valor do Desconto por Unidade (R$)'}
              </Label>
              <div className="relative">
                <Input
                  id="desconto-item-input"
                  type="text"
                  placeholder={tipo === 'percentual' ? 'Ex: 5 ou 10' : 'Ex: 150.00'}
                  value={valorInput}
                  onChange={(e) => setValorInput(e.target.value)}
                  className="font-mono pr-12"
                  autoFocus
                />
                <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-mono">
                  {tipo === 'percentual' ? '%' : 'R$'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {[5, 10, 15].map((sug) => (
                  <Button
                    key={sug}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setTipo('percentual')
                      setValorInput(String(sug))
                    }}
                  >
                    {sug}%
                  </Button>
                ))}
              </div>
            </div>

            {/* Alerta de Limite do Vendedor */}
            {excedeLimiteVendedor && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Desconto acima do seu limite ({limiteVendedor}%)</p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                    A proposta será encaminhada com status <strong>"Aguardando aprovação"</strong>{' '}
                    para liberação do administrador.
                  </p>
                </div>
              </div>
            )}

            {/* Pré-visualização do Cálculo */}
            <div className="p-3 rounded-lg bg-muted/60 border border-border space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-muted-foreground">
                <span>Desconto Unitário:</span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  - {formatBRL(calc.descontoUnitario)} ({formatPercent(percentualEfetivo)})
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Novo Preço Unit. Líquido:</span>
                <span className="text-foreground font-bold">{formatBRL(calc.precoLiquido)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-border/60">
                <span className="text-muted-foreground font-sans">
                  Subtotal do Item ({item.quantidade}x):
                </span>
                <span className="font-bold text-foreground">
                  {formatBRL(calc.subtotalLiquidoItem)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Economia total no item:</span>
                <span className="text-rose-600 dark:text-rose-400">
                  {formatBRL(calc.totalDescontoItem)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {item.total_desconto ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleRemoverDesconto}
                disabled={isSubmitting}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs mr-auto"
              >
                Remover Desconto
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Aplicar Desconto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
