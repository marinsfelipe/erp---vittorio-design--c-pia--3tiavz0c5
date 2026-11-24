import { Link } from 'react-router-dom'
import { ArrowRight, Calculator, Plus, Trash2, DollarSign, PackagePlus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { labelTipoItem } from '@/types/erp'
import type { Bom, Componente } from '@/types/erp'

/**
 * Card de um item que JÁ possui BOM — mesmas métricas e ações de antes
 * (editor, precificação, exclusão, checkbox da edição em lote).
 */
export function CardBomExistente({
  bom,
  itemCount,
  custoTotal,
  precoSugerido,
  isAdmin,
  loteColunaCheckbox,
  isDeleting,
  onDelete,
  defaultOverhead,
  defaultMargem,
}: {
  bom: Bom
  itemCount: number
  custoTotal: number
  precoSugerido: number
  isAdmin: boolean
  loteColunaCheckbox: (id: string) => React.ReactNode
  isDeleting: boolean
  onDelete: (e: React.MouseEvent) => void
  defaultOverhead: number
  defaultMargem: number
}) {
  return (
    <Card className="flex flex-col justify-between hover:shadow-md transition-all duration-200 border-border group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isAdmin && loteColunaCheckbox(bom.id)}
            <Badge
              variant="outline"
              className="font-mono text-xs font-bold text-primary bg-primary/5"
            >
              {bom.sku}
            </Badge>
            {bom.categoria && (
              <Badge variant="secondary" className="text-[10px] font-medium">
                {bom.categoria}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive/70 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onDelete}
              disabled={isDeleting}
              title="Excluir BOM"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <CardTitle className="text-lg font-bold text-foreground mt-1 group-hover:text-primary transition-colors">
          {bom.nome}
        </CardTitle>
        <CardDescription className="text-xs line-clamp-2 mt-1">
          {bom.descricao || 'Sem descrição cadastrada'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="bg-muted/40 p-3 rounded-lg space-y-2 border border-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Itens / Linhas:</span>
            <span className="font-semibold text-foreground">{itemCount} componentes</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Custo Consolidado:</span>
            <span className="font-mono font-semibold text-foreground">{formatBRL(custoTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Σ% (Overhead + Margem):</span>
            <span className="font-mono text-amber-700 dark:text-amber-400">
              {formatPercent(
                (bom.overhead_percentual ?? defaultOverhead) +
                  (bom.margem_percentual ?? defaultMargem),
              )}
            </span>
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
              Preço Sugerido:
            </span>
            <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
              {formatBRL(precoSugerido)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Link to={`/boms/${bom.id}`}>
            <Button variant="default" size="sm" className="w-full gap-1.5 text-xs">
              Abrir Editor
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Link to={`/precificacao/${bom.id}`}>
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
              <Calculator className="h-3.5 w-3.5" />
              Precificação
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Card de um item que PODE possuir BOM mas ainda NÃO tem — mostra o botão
 * "Criar BOM" (abre o diálogo já com este item pré-selecionado).
 */
export function CardItemSemBom({
  comp,
  isAdmin,
  onCriarBom,
}: {
  comp: Componente
  isAdmin: boolean
  onCriarBom: (comp: Componente) => void
}) {
  return (
    <Card className="flex flex-col justify-between border-dashed border-border/70 group hover:shadow-sm transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className="font-mono text-xs font-bold text-muted-foreground bg-muted/50"
          >
            {comp.codigo}
          </Badge>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {labelTipoItem(comp.tipo)}
          </Badge>
          {comp.categoria && (
            <Badge variant="secondary" className="text-[10px] font-medium">
              {comp.categoria}
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg font-bold text-foreground mt-1">{comp.descricao}</CardTitle>
        <CardDescription className="text-xs mt-1">
          {comp.fornecedor ? `Fornecedor: ${comp.fornecedor}` : 'Item do catálogo sem BOM'}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="bg-muted/30 p-3 rounded-lg space-y-2 border border-dashed border-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Status:</span>
            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-500/40">
              Sem BOM — sem custo calculado
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Custo de referência:</span>
            <span className="font-mono text-foreground">{formatBRL(comp.custo_unitario || 0)}</span>
          </div>
        </div>
        {isAdmin ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs mt-3"
            onClick={() => onCriarBom(comp)}
          >
            <Plus className="h-3.5 w-3.5" />
            Criar BOM
          </Button>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-3 text-center flex items-center justify-center gap-1">
            <PackagePlus className="h-3 w-3" />
            BOM ainda não criada para este item (apenas admin cria)
          </p>
        )}
      </CardContent>
    </Card>
  )
}
