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
import type { Proposta, DescontoTipo, PropostaItem } from '@/types/erp'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { calcularTotaisProposta } from '@/utils/descontos'
import { Percent, DollarSign, Sparkles, Info } from 'lucide-react'

interface AplicarDescontoGeralDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proposta: Proposta | null
  itens: PropostaItem[]
  onConfirm: (tipo: DescontoTipo, valor: number) => Promise<void>
  isSubmitting?: boolean
  limiteVendedor?: number
  isVendedor?: boolean
}

export function AplicarDescontoGeralDialog({
  open,
  onOpenChange,
  proposta,
  itens,
  onConfirm,
  isSubmitting = false,
  limiteVendedor = 10,
  isVendedor = false,
}: AplicarDescontoGeralDialogProps) {
  const [tipo, setTipo] = useState<DescontoTipo>('percentual')
  const [valorInput, setValorInput] = useState<string>('')

  useEffect(() => {
    if (open && proposta) {
      setTipo(proposta.desconto_tipo || 'percentual')
      setValorInput(proposta.desconto_valor ? String(proposta.desconto_valor) : '')
    }
  }, [open, proposta])

  if (!proposta) return null

  const valorNumerico = Math.max(0, parseFloat(valorInput.replace(',', '.')) || 0)
  const totais = calcularTotaisProposta(itens, tipo, valorNumerico)
  const excedeLimiteVendedor = isVendedor && totais.percentualDescontoTotal > limiteVendedor

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
              <Sparkles className="h-5 w-5 text-primary" />
              <DialogTitle>Desconto Geral na Proposta</DialogTitle>
            </div>
            <DialogDescription>
              Aplique um desconto global em valor (R$) ou percentual (%) incidente sobre o subtotal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Resumo da base de cálculo */}
            <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1 text-xs font-mono">
              <div className="flex justify-between text-muted-foreground font-sans">
                <span>Subtotal dos Produtos:</span>
                <span className="font-mono text-foreground font-medium">
                  {formatBRL(totais.subtotal)}
                </span>
              </div>
              {totais.totalDescontoItens > 0 && (
                <div className="flex justify-between text-muted-foreground font-sans">
                  <span>Descontos já aplicados nos itens:</span>
                  <span className="font-mono text-rose-600 dark:text-rose-400 font-medium">
                    - {formatBRL(totais.totalDescontoItens)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-border/50 font-sans">
                <span className="text-muted-foreground">Base p/ Desconto Geral:</span>
                <span className="font-mono font-bold text-foreground">
                  {formatBRL(totais.subtotalAposDescontoItens)}
                </span>
              </div>
            </div>

            {/* Alternância Tipo: R$ ou % */}
            <div className="space-y-1.5">
              <Label className="text-xs">Formato do Desconto Geral</Label>
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
              <Label htmlFor="desconto-geral-input" className="text-xs">
                {tipo === 'percentual'
                  ? 'Percentual Geral sobre o Subtotal (%)'
                  : 'Valor Geral de Desconto (R$)'}
              </Label>
              <div className="relative">
                <Input
                  id="desconto-geral-input"
                  type="text"
                  placeholder={tipo === 'percentual' ? 'Ex: 5 ou 10' : 'Ex: 1000.00'}
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
                {[3, 5, 7, 10].map((sug) => (
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
                  <p className="font-semibold">
                    Desconto total acumulado ({formatPercent(totais.percentualDescontoTotal)})
                    excede seu limite ({limiteVendedor}%)
                  </p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                    Ao confirmar, a proposta entrará no status{' '}
                    <strong>"Aguardando aprovação"</strong> e o administrador deverá liberar
                    comercialmente.
                  </p>
                </div>
              </div>
            )}

            {/* Pré-visualização dos Totais Finais */}
            <div className="p-3.5 rounded-lg bg-muted/60 border border-border space-y-2 text-xs font-mono">
              <div className="flex justify-between text-muted-foreground font-sans">
                <span>Subtotal Bruto:</span>
                <span className="font-mono font-medium text-foreground">
                  {formatBRL(totais.subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground font-sans">
                <span>Desconto por Itens:</span>
                <span className="font-mono text-rose-600 dark:text-rose-400 font-medium">
                  {totais.totalDescontoItens > 0
                    ? `- ${formatBRL(totais.totalDescontoItens)}`
                    : 'R$ 0,00'}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground font-sans">
                <span>Desconto Geral:</span>
                <span className="font-mono text-rose-600 dark:text-rose-400 font-medium">
                  {totais.totalDescontoGeral > 0
                    ? `- ${formatBRL(totais.totalDescontoGeral)}`
                    : 'R$ 0,00'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border font-sans items-baseline">
                <div>
                  <span className="font-bold text-sm text-foreground">TOTAL FINAL:</span>
                  <p className="text-[10px] text-muted-foreground font-sans">
                    Desconto total efetivo: {formatPercent(totais.percentualDescontoTotal)}
                  </p>
                </div>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {formatBRL(totais.totalFinal)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {proposta.total_desconto_geral ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleRemoverDesconto}
                disabled={isSubmitting}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs mr-auto"
              >
                Remover Desconto Geral
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
              {isSubmitting ? 'Salvando...' : 'Aplicar Desconto Geral'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
