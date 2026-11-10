import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatBRL, formatPercent } from '@/utils/formatters'
import type { TotaisCalculadosProposta } from '@/utils/descontos'
import type { Proposta } from '@/types/erp'
import { Sparkles, Tag, ShieldAlert } from 'lucide-react'

interface ResumoTotaisPropostaCardProps {
  totais: TotaisCalculadosProposta
  proposta: Proposta
  onAbrirDescontoGeral: () => void
  disabled?: boolean
  isVendedor?: boolean
  limiteVendedor?: number
}

export function ResumoTotaisPropostaCard({
  totais,
  proposta,
  onAbrirDescontoGeral,
  disabled = false,
  isVendedor = false,
  limiteVendedor = 10,
}: ResumoTotaisPropostaCardProps) {
  const excedeLimite = isVendedor && totais.percentualDescontoTotal > limiteVendedor
  const temDescontoGeral = (totais.totalDescontoGeral || 0) > 0
  const temDescontoItens = (totais.totalDescontoItens || 0) > 0

  return (
    <Card className="border-border bg-card shadow-xs">
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <span>Totais e Descontos</span>
              {totais.percentualDescontoTotal > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-mono"
                >
                  -{formatPercent(totais.percentualDescontoTotal)}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Subtotal bruto, abatimentos por itens, desconto geral e valor final
            </CardDescription>
          </div>
          {!disabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAbrirDescontoGeral}
              className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {temDescontoGeral ? 'Alterar Desconto Geral' : 'Adicionar Desconto Geral'}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        {/* Linha Subtotal */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal dos Produtos:</span>
          <span className="font-mono font-medium text-foreground">
            {formatBRL(totais.subtotal)}
          </span>
        </div>

        {/* Linha Desconto por Itens */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Desconto por Itens:</span>
          </span>
          <span
            className={`font-mono font-medium ${
              temDescontoItens ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
            }`}
          >
            {temDescontoItens ? `- ${formatBRL(totais.totalDescontoItens)}` : 'R$ 0,00'}
          </span>
        </div>

        {/* Linha Desconto Geral */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Desconto Geral da Proposta:</span>
            {proposta.desconto_tipo === 'percentual' && (proposta.desconto_valor || 0) > 0 && (
              <span className="text-xs text-muted-foreground">({proposta.desconto_valor}%)</span>
            )}
          </span>
          <span
            className={`font-mono font-medium ${
              temDescontoGeral ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
            }`}
          >
            {temDescontoGeral ? `- ${formatBRL(totais.totalDescontoGeral)}` : 'R$ 0,00'}
          </span>
        </div>

        {/* Total Final em Destaque */}
        <div className="pt-3 border-t border-border flex items-baseline justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Final
            </span>
            {totais.totalDescontos > 0 && (
              <p className="text-[11px] text-muted-foreground font-mono">
                Economia total: {formatBRL(totais.totalDescontos)}
              </p>
            )}
          </div>
          <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatBRL(totais.totalFinal)}
          </span>
        </div>

        {/* Aviso de aprovação pendente caso exceda limite */}
        {proposta.status === 'aguardando_aprovacao' && (
          <div className="mt-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              Proposta em status <strong>Aguardando aprovação</strong> devido a desconto acima do
              limite do vendedor ({limiteVendedor}%).
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
