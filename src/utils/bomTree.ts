import type { Bom, BomItem, TipoItemBom } from '@/types/erp'
import { aceitaFilhos, CATEGORIA_KIT } from '@/types/erp'

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

// ---------------------------------------------------------------------------
// Hierarquia aninhada de BOMs — custo recursivo entre BOMs
// ---------------------------------------------------------------------------

/**
 * Contexto de custo com TODOS os BOMs e seus itens carregados de uma vez
 * (padrão getAllItemsGrouped — UMA listagem, nunca 1 request por BOM).
 * Um item fabricado cujo `codigo` é o SKU de outro BOM resolve seu custo
 * pela explosão daquele sub-BOM.
 */
export interface ContextoCustoBoms {
  /** SKU do BOM (caixa alta) -> itens diretos daquele BOM. */
  itensPorSku: Map<string, BomItem[]>
  /** Memo do custo consolidado por SKU (evita recomputar referências repetidas). */
  custoPorSku: Map<string, number>
  /** SKU do BOM (caixa alta) -> o registro do BOM (dados da raiz: nome, categoria). */
  bomPorSku: Map<string, Bom>
}

/** Monta o contexto a partir das duas listagens únicas (BOMs + itens agrupados).
 */
export function montarContextoCusto(
  itensGrouped: Record<string, BomItem[]>,
  boms: Bom[],
): ContextoCustoBoms {
  const itensPorSku = new Map<string, BomItem[]>()
  const bomPorSku = new Map<string, Bom>()
  for (const bom of boms) {
    const sku = (bom.sku || '').trim().toUpperCase()
    itensPorSku.set(sku, itensGrouped[bom.id] || [])
    bomPorSku.set(sku, bom)
  }
  return { itensPorSku, custoPorSku: new Map(), bomPorSku }
}

function raizVirtualDe(sku: string, itens: BomItem[], ctx?: ContextoCustoBoms): BomItem {
  const bom = ctx?.bomPorSku.get(sku)
  return {
    id: `virtual-sub-${sku}`,
    bom_id: bom?.id ?? '',
    nivel: 0,
    ordem: 0,
    codigo: sku,
    descricao: bom?.nome || sku,
    unidade: bom?.unidade || 'UN',
    quantidade: 1,
    custo_unitario: 0,
    item_tipo: 'produto_final',
  }
}

/**
 * Custo consolidado do sub-BOM `sku`, com memo e proteção de ciclo: um SKU
 * já presente na cadeia de ancestrais (`visitados`) NÃO é revisitado — a
 * referência circular contribui com 0 em vez de travar a página.
 */
function custoConsolidadoSubBom(
  sku: string,
  ctx: ContextoCustoBoms,
  visitados: Set<string>,
): number {
  const memo = ctx.custoPorSku.get(sku)
  if (memo !== undefined) return memo
  visitados.add(sku)
  let total = 0
  const itens = ctx.itensPorSku.get(sku) || []
  if (itens.length > 0) {
    const raiz = buildTree(itens, raizVirtualDe(sku, itens, ctx))
    total = raiz.children.reduce(
      (acc, f) => acc + (Number(f.item.quantidade) || 0) * calcularCustoUnitario(f, ctx, visitados),
      0,
    )
  }
  visitados.delete(sku)
  ctx.custoPorSku.set(sku, total)
  return total
}

/**
 * Custo unitário por rolagem recursiva:
 * - componente de terceiros (folha): custo digitado
 * - fabricado (semi-acabado, interno, KIT): se o código é raiz de outro BOM,
 *   o custo desce na lista do sub-BOM (recursão entre BOMs); senão, soma dos
 *   (quantidade × custo unitário) dos filhos locais.
 * `ehRaiz` evita o BOM resolver a si mesmo (a raiz de um BOM nunca consulta
 * o próprio SKU como sub-BOM).
 */
export function calcularCustoUnitario(
  node: TreeNode,
  ctx?: ContextoCustoBoms,
  visitados?: Set<string>,
  ehRaiz = false,
): number {
  const tipo = node.item.item_tipo
  if (tipo === 'componente_terceiros') {
    return Number(node.item.custo_unitario) || 0
  }
  if (ctx && !ehRaiz) {
    const sku = (node.item.codigo || '').trim().toUpperCase()
    if (sku && ctx.itensPorSku.has(sku) && !(visitados && visitados.has(sku))) {
      return custoConsolidadoSubBom(sku, ctx, visitados || new Set())
    }
  }
  return node.children.reduce(
    (acc, f) => acc + (Number(f.item.quantidade) || 0) * calcularCustoUnitario(f, ctx, visitados),
    0,
  )
}

/** Custo total de um nó = quantidade × custo unitário (calculado se fabricado). */
export function calcularCustoTotal(
  node: TreeNode,
  ctx?: ContextoCustoBoms,
  ehRaiz = false,
): number {
  return (Number(node.item.quantidade) || 0) * calcularCustoUnitario(node, ctx, undefined, ehRaiz)
}

/**
 * Custo consolidado do produto = custo total da raiz da árvore. Quando o
 * contexto de BOMs é informado, o custo desce recursivamente nos sub-BOMs
 * (itens que apontam para outra BOM) com proteção contra ciclo.
 */
export function calcularCustoConsolidado(root: TreeNode, ctx?: ContextoCustoBoms): number {
  return calcularCustoTotal(root, ctx, true)
}

/**
 * Monta a árvore a partir de dados já carregados (sem chamadas de rede).
 * Detecção da raiz, nesta ordem:
 * 1. item com `item_tipo === tipoRaiz` (padrão produto_final);
 * 2. âncora pelo código: item de topo (sem parent_id) cujo código é o
 *    SKU do próprio BOM — é assim que BOMs de semi-acabado/componente
 *    interno/KIT guardam sua raiz (item gravado na criação com o tipo
 *    escolhido), sem precisar de campo novo em `boms`;
 * 3. raiz virtual derivada do próprio BOM (legado) para que nada se perda.
 */
export function montarArvore(
  bom: Bom | null,
  items: BomItem[],
  tipoRaiz: TipoItemBom = 'produto_final',
) {
  let rootItem = items.find((i) => i.item_tipo === tipoRaiz)
  if (!rootItem && tipoRaiz !== 'produto_final') {
    rootItem = items.find((i) => i.item_tipo === 'produto_final')
  }
  if (!rootItem) {
    const sku = (bom?.sku || '').trim().toUpperCase()
    rootItem = sku
      ? items.find((i) => !i.parent_id && (i.codigo || '').trim().toUpperCase() === sku)
      : undefined
  }
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

/**
 * Tipo de raiz de um BOM existente, usado ao vinculá-lo como sub-BOM:
 * tipo do item raiz ancorado pelo SKU; sem raiz gravada, infere pela
 * categoria (KIT → kit_montagem_interna; senão produto_semi_acabado).
 */
export function inferirTipoRaizBom(bom: Bom, items: BomItem[]): TipoItemBom {
  const sku = (bom.sku || '').trim().toUpperCase()
  const raiz = items.find((i) => !i.parent_id && (i.codigo || '').trim().toUpperCase() === sku)
  const tipo = raiz?.item_tipo
  if (tipo && tipo !== 'componente_terceiros') return tipo
  return (bom.categoria || '').trim().toUpperCase() === CATEGORIA_KIT
    ? 'kit_montagem_interna'
    : 'produto_semi_acabado'
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

/**
 * Explosão para LISTA DE COMPRAS: achata a árvore coletando apenas itens
 * comprados (componente_terceiros), com a quantidade acumulada de toda a
 * cadeia de pais. Quando uma folha fabricada referencia outro BOM (sub-BOM
 * sem filhos locais), a explosão desce na lista do sub-BOM (recursão, com
 * proteção de ciclo via `visitados`).
 */
export function explodirItensCompra(root: TreeNode, ctx?: ContextoCustoBoms): BomItem[] {
  const out: BomItem[] = []
  const visitados = new Set<string>()
  const skuRaiz = (root.item.codigo || '').trim().toUpperCase()
  if (skuRaiz) visitados.add(skuRaiz)

  const walk = (node: TreeNode, mult: number) => {
    const it = node.item
    if (it.item_tipo === 'componente_terceiros') {
      out.push({ ...it, quantidade: (Number(it.quantidade) || 0) * mult })
      return
    }
    // Antes de descer nos filhos locais, um nó fabricado cujo código é o SKU
    // de outro BOM (e que NÃO é a raiz da explosão) tem sua lista resolvida
    // pelo sub-BOM — mesmo que tenha filhos locais (filhos gravados localmente
    // nunca substituem a lista oficial do sub-BOM; evita custo duplo).
    const sku = (it.codigo || '').trim().toUpperCase()
    const ehRaizExplosao = node === root
    if (ctx && !ehRaizExplosao && sku && ctx.itensPorSku.has(sku) && !visitados.has(sku)) {
      visitados.add(sku)
      const itens = ctx.itensPorSku.get(sku) || []
      const sub = buildTree(itens, raizVirtualDe(sku, itens, ctx))
      for (const f of sub.children) {
        walk(f, mult * (Number(it.quantidade) || 1))
      }
      visitados.delete(sku)
      return
    }
    if (node.children.length > 0) {
      for (const f of node.children) {
        walk(f, mult * (Number(it.quantidade) || 1))
      }
      return
    }
    // Folha fabricada sem filhos locais e sem sub-BOM: não entra na lista de compras
  }
  walk(root, 1)
  return out
}
