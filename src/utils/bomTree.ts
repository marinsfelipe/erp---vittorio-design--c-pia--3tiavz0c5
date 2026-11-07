import type { Bom, BomItem, TipoItemBom } from '@/types/erp'
import { aceitaFilhos } from '@/types/erp'

export interface TreeNode {
  item: BomItem
  children: TreeNode[]
  depth: number
  parent?: TreeNode
}

/**
 * Monta a árvore a partir de `root` (item_tipo = produto_final) seguindo
 * parent_id. Itens com parent inexistente dentro do BOM ficam pendurados
 * direto na raiz para não se perderem.
 */
export function buildTree(items: BomItem[], root: BomItem): TreeNode {
  const childrenMap = new Map<string, BomItem[]>()
  for (const it of items) {
    if (it.id === root.id) continue
    const key = it.parent_id && it.parent_id !== root.id ? it.parent_id : root.id
    if (!childrenMap.has(key)) childrenMap.set(key, [])
    childrenMap.get(key)!.push(it)
  }
  const build = (item: BomItem, depth: number, parent?: TreeNode): TreeNode => {
    const node: TreeNode = {
      item,
      depth,
      parent,
      children: [],
    }
    node.children = (childrenMap.get(item.id) ?? []).map((c) => build(c, depth + 1, node))
    return node
  }
  return build(root, 0)
}

/** Achata a árvore em pré-ordem, preservando depth. */
export function flattenTree(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (n: TreeNode) => {
    out.push(n)
    n.children.forEach(walk)
  }
  walk(node)
  return out
}

/**
 * Custo unitário por rolagem recursiva:
 * - componente de terceiros (folha): custo digitado
 * - fabricado (semi-acabado, interno): soma dos (quantidade × custo unitário) dos filhos
 */
export function calcularCustoUnitario(node: TreeNode): number {
  if (node.item.item_tipo === 'componente_terceiros') {
    return Number(node.item.custo_unitario) || 0
  }
  return node.children.reduce(
    (acc, f) => acc + (Number(f.item.quantidade) || 0) * calcularCustoUnitario(f),
    0,
  )
}

/** Custo total de um nó = quantidade × custo unitário (calculado se fabricado). */
export function calcularCustoTotal(node: TreeNode): number {
  return (Number(node.item.quantidade) || 0) * calcularCustoUnitario(node)
}

/** Custo consolidado do produto final = custo total da raiz da árvore. */
export function calcularCustoConsolidado(root: TreeNode): number {
  return calcularCustoTotal(root)
}

/**
 * Monta a árvore a partir de dados já carregados (sem chamadas de rede).
 * Se o BOM ainda não tem raiz produto_final (legado), usa raiz virtual
 * derivada do próprio BOM para que nada se perda visualmente.
 */
export function montarArvore(bom: Bom | null, items: BomItem[]) {
  let rootItem = items.find((i) => i.item_tipo === 'produto_final')
  let virtual = false
  if (!rootItem) {
    rootItem = {
      id: `virtual-${bom?.id ?? 'raiz'}`,
      bom_id: bom?.id ?? '',
      nivel: 0,
      ordem: 0,
      codigo: bom?.sku ?? 'PRODUTO',
      descricao: bom?.nome ?? 'Produto Final',
      unidade: 'UN',
      quantidade: 1,
      custo_unitario: 0,
      item_tipo: 'produto_final',
    }
    virtual = true
  }
  const root = buildTree(
    items.filter((i) => !virtual || i.id !== rootItem!.id),
    rootItem,
  )
  return { root, nodes: flattenTree(root) }
}

export function podeReceberFilho(node: TreeNode): boolean {
  return aceitaFilhos(node.item.item_tipo)
}

/** Valida a inclusão de um filho sob `parent`, retornando mensagem de erro ou null. */
export function validarInclusaoFilho(parent: TreeNode, novoTipo: TipoItemBom): string | null {
  if (!podeReceberFilho(parent)) {
    return 'Componente de Terceiros não aceita itens filhos — é um item comprado (folha).'
  }
  return null
}

/**
 * Detecta se criar um filho com `codigo` sob o nó `parent` criaria um ciclo
 * (o mesmo código já presente na cadeia de ancestrais do pai).
 */
export function criariaCicloPorCodigo(parent: TreeNode, codigo: string): boolean {
  const cod = codigo.trim().toUpperCase()
  let cur: TreeNode | undefined = parent
  while (cur) {
    if (cur.item.codigo.trim().toUpperCase() === cod) return true
    cur = cur.parent
  }
  return false
}
