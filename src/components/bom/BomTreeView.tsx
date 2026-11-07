import { useMemo, useState } from 'react'
import type { Bom, BomItem } from '@/types/erp'
import { labelTipoItem } from '@/types/erp'
import { montarArvore, calcularCustoUnitario, type TreeNode } from '@/utils/bomTree'
import { formatBRL } from '@/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'

const corTipo = (tipo?: string) => {
  switch (tipo) {
    case 'produto_final':
      return 'bg-primary/10 text-primary border-primary/30'
    case 'produto_semi_acabado':
      return 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30'
    case 'componente_interno':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

const aceitaFilhos = (tipo?: string) => tipo !== 'componente_terceiros'

interface BomTreeViewProps {
  bom: Bom
  items: BomItem[]
  /** Controla quais nós estão expandidos (opcional, para persistir entre renders). */
  expanded?: Set<string>
  onExpandedChange?: (next: Set<string>) => void
  onQuantidadeChange?: (id: string, qtd: number) => void
  onCustoChange?: (id: string, custo: number) => void
  onAddChild?: (node: TreeNode) => void
  onRemove?: (node: TreeNode) => void
}

/**
 * Árvore multi-nível do BOM: indentada por nível, expansível/recolhível,
 * com tipo, código, descrição, quantidade, custo unitário (calculado por
 * rolagem para itens fabricados) e custo total de cada item.
 */
export default function BomTreeView({
  bom,
  items,
  expanded: expandedProp,
  onExpandedChange,
  onQuantidadeChange,
  onCustoChange,
  onAddChild,
  onRemove,
}: BomTreeViewProps) {
  const [expandedInterno, setExpandedInterno] = useState<Set<string>>(new Set())

  const tree = useMemo(() => montarArvore(bom, items), [bom, items])

  const expanded = expandedProp ?? expandedInterno
  const setExpanded = (next: Set<string>) => {
    if (onExpandedChange) onExpandedChange(next)
    else setExpandedInterno(next)
  }

  const toggle = (id: string) => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }

  const expandirTodos = () => {
    setExpanded(new Set(tree.nodes.map((n) => n.item.id)))
  }

  const recolherTodos = () => setExpanded(new Set())

  const renderNode = (node: TreeNode) => {
    const { item, children, depth } = node
    const temFilhos = children.length > 0
    const aberto = expanded.has(item.id)
    const fabricado = item.item_tipo !== 'componente_terceiros'
    const custoUnit = calcularCustoUnitario(node)
    const custoTotal = (Number(item.quantidade) || 0) * custoUnit
    const podeEditar = Boolean(onQuantidadeChange || onCustoChange)
    const ehRaiz = depth === 0

    return (
      <div key={item.id}>
        <div
          className={`flex items-center gap-2 px-3 py-2 border-b border-border/60 text-sm hover:bg-muted/30 ${
            ehRaiz ? 'bg-primary/[0.04] font-medium' : ''
          }`}
          style={{ paddingLeft: `${12 + depth * 24}px` }}
        >
          {/* Expandir/recolher */}
          <button
            type="button"
            onClick={() => temFilhos && toggle(item.id)}
            className={`h-5 w-5 flex items-center justify-center rounded shrink-0 ${
              temFilhos ? 'text-muted-foreground hover:bg-muted' : 'opacity-0'
            }`}
            title={temFilhos ? (aberto ? 'Recolher' : 'Expandir') : ''}
            disabled={!temFilhos}
          >
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {/* Tipo */}
          <Badge
            variant="outline"
            className={`text-[10px] whitespace-nowrap shrink-0 ${corTipo(item.item_tipo)}`}
          >
            {labelTipoItem(item.item_tipo)}
          </Badge>

          {/* Código */}
          <span className="font-mono text-xs font-semibold text-primary w-28 shrink-0 truncate">
            {item.codigo}
          </span>

          {/* Descrição */}
          <span className="flex-1 min-w-0 truncate text-foreground" title={item.descricao}>
            {item.descricao}
          </span>

          {/* Quantidade */}
          <div className="w-20 shrink-0 text-center">
            {podeEditar && !ehRaiz ? (
              <Input
                type="number"
                step="0.01"
                min="0"
                className="h-7 w-20 text-center font-mono text-xs"
                value={item.quantidade}
                onChange={(e) => onQuantidadeChange?.(item.id, parseFloat(e.target.value) || 0)}
              />
            ) : (
              <span className="font-mono text-xs">{item.quantidade}</span>
            )}
          </div>

          {/* Custo unitário */}
          <div className="w-28 shrink-0 text-right">
            {fabricado ? (
              <span
                className="font-mono text-xs text-muted-foreground italic"
                title="Calculado pela soma dos filhos (quantidade × custo unitário)"
              >
                {formatBRL(custoUnit) || '—'}
              </span>
            ) : podeEditar ? (
              <Input
                type="number"
                step="0.01"
                min="0"
                className="h-7 w-28 text-right font-mono text-xs"
                value={item.custo_unitario}
                onChange={(e) => onCustoChange?.(item.id, parseFloat(e.target.value) || 0)}
              />
            ) : (
              <span className="font-mono text-xs">{formatBRL(item.custo_unitario)}</span>
            )}
          </div>

          {/* Custo total */}
          <span className="w-28 shrink-0 text-right font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {formatBRL(custoTotal)}
          </span>

          {/* Ações */}
          {(onAddChild || onRemove) && (
            <div className="w-16 shrink-0 flex items-center justify-end gap-0.5">
              {onAddChild && aceitaFilhos(item.item_tipo) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-primary"
                  onClick={() => onAddChild(node)}
                  title="Adicionar item filho"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
              {onRemove && !ehRaiz && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive/70 hover:text-destructive"
                  onClick={() => onRemove(node)}
                  title="Remover item e seus filhos"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Filhos */}
        {temFilhos && aberto && children.map(renderNode)}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 border-b border-border text-xs">
        <div className="flex-1 font-semibold text-muted-foreground pl-8">
          Árvore do Produto ({tree.nodes.length} itens)
        </div>
        <div className="w-20 text-center font-semibold text-muted-foreground">Qtd</div>
        <div className="w-28 text-right font-semibold text-muted-foreground">Custo Unit.</div>
        <div className="w-28 text-right font-semibold text-muted-foreground">Custo Total</div>
        {(onAddChild || onRemove) && <div className="w-16" />}
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 text-xs">
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={expandirTodos}>
          Expandir tudo
        </Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={recolherTodos}>
          Recolher tudo
        </Button>
      </div>
      {renderNode(tree.root)}
      <div className="flex items-center justify-between px-3 py-2.5 bg-muted/40 text-sm">
        <span className="text-muted-foreground text-xs">
          Custo consolidado = rolagem recursiva de toda a árvore (soma de quantidade × custo
          unitário dos itens comprados)
        </span>
        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
          {formatBRL(calcularCustoUnitario(tree.root) * (Number(tree.root.item.quantidade) || 0))}
        </span>
      </div>
    </div>
  )
}
