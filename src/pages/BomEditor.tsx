import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { bomsService } from '@/services/boms'
import { componentesService } from '@/services/componentes'
import { parametrosService } from '@/services/parametros'
import type { Bom, BomItem, Componente, TipoItemBom } from '@/types/erp'
import { aceitaFilhos, labelTipoItem, TIPOS_ITEM_BOM } from '@/types/erp'
import {
  validarInclusaoFilho,
  criariaCicloPorCodigo,
  montarArvore,
  calcularCustoConsolidado,
  calcularCustoUnitario,
  type TreeNode,
} from '@/utils/bomTree'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { calcularMarkupDivisor, montarPercentuais } from '@/utils/pricing'
import BomTreeView from '@/components/bom/BomTreeView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save, Calculator, FolderTree, Search, Check } from 'lucide-react'
import { toast } from 'sonner'
import { CategoriaProdutoSelector } from '@/components/bom/CategoriaProdutoSelector'

export default function BomEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [bom, setBom] = useState<Bom | null>(null)
  const [items, setItems] = useState<BomItem[]>([])
  const [availableComponents, setAvailableComponents] = useState<Componente[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [defaultParams, setDefaultParams] = useState<{
    overhead: number
    margem: number
    map: Record<string, number>
  }>({ overhead: 14.5, margem: 28.0, map: {} })

  // Modal para adicionar item filho a um nó da árvore
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [parentNode, setParentNode] = useState<TreeNode | null>(null)
  const [novoTipo, setNovoTipo] = useState<TipoItemBom>('componente_terceiros')
  const [searchComp, setSearchComp] = useState('')
  const [selectedComp, setSelectedComp] = useState<Componente | null>(null)
  const [newItemQuantity, setNewItemQuantity] = useState<string>('1')
  const [fabCodigo, setFabCodigo] = useState('')
  const [fabDescricao, setFabDescricao] = useState('')
  const [fabCategoria, setFabCategoria] = useState('Produção Interna')

  const loadData = async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const [bomData, itemsData, compList, paramsMap] = await Promise.all([
        bomsService.getById(id),
        bomsService.getItems(id),
        componentesService.getAll(),
        parametrosService.getMap(),
      ])
      setBom(bomData)
      setItems(itemsData)
      setAvailableComponents(compList)
      setDefaultParams({
        overhead: paramsMap['overhead'] ?? 14.5,
        margem: paramsMap['margem_alvo'] ?? 28.0,
        map: paramsMap,
      })
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar detalhes do BOM')
      navigate('/boms')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Árvore multi-nível: rolagem recursiva a partir da raiz produto_final.
  const arvore = useMemo(() => montarArvore(bom, items), [bom, items])
  const custoConsolidado = useMemo(() => calcularCustoConsolidado(arvore.root), [arvore])
  const raizNode = arvore.root

  const overheadPct =
    bom?.overhead_percentual !== undefined ? bom.overhead_percentual : defaultParams.overhead
  const margemPct =
    bom?.margem_percentual !== undefined ? bom.margem_percentual : defaultParams.margem
  // Fórmula oficial (MARKUP DIVISOR): Preço = Custo / (1 − Σ%). Usa TODOS os
  // percentuais da tabela de parâmetros, com override de overhead/margem do SKU.
  const resultadoPricing = calcularMarkupDivisor(
    custoConsolidado,
    montarPercentuais(defaultParams.map as Record<string, number>, {
      overhead: overheadPct,
      margem: margemPct,
    }),
  )
  const precoFinal = resultadoPricing.precoVenda

  const filhosDe = (parentId: string) => items.filter((i) => i.parent_id === parentId)

  const handleQuantidadeChange = (itemId: string, qtd: number) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, quantidade: qtd } : it)))
  }

  const handleCustoChange = (itemId: string, custo: number) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, custo_unitario: custo } : it)))
  }

  const handleOpenAddChild = (node: TreeNode) => {
    if (!aceitaFilhos(node.item.item_tipo)) {
      toast.error('Componente de Terceiros não aceita itens filhos — é um item comprado (folha).')
      return
    }
    setParentNode(node)
    setNovoTipo('componente_terceiros')
    setSelectedComp(null)
    setSearchComp('')
    setNewItemQuantity('1')
    setFabCodigo('')
    setFabDescricao('')
    setFabCategoria('Produção Interna')
    setIsAddOpen(true)
  }

  const handleRemoveNode = (node: TreeNode) => {
    const ids = coletarIds(node)
    setItems((prev) => prev.filter((it) => !ids.has(it.id)))
    toast.success(`Item "${node.item.descricao}" e seus filhos foram removidos.`)
  }

  const coletarIds = (node: TreeNode): Set<string> => {
    const ids = new Set<string>()
    const walk = (n: TreeNode) => {
      ids.add(n.item.id)
      n.children.forEach(walk)
    }
    walk(node)
    return ids
  }

  const compDisponiveis = availableComponents.filter((c) =>
    `${c.codigo} ${c.descricao} ${c.categoria}`.toLowerCase().includes(searchComp.toLowerCase()),
  )

  const handleAddConfirm = () => {
    if (!parentNode || !id) return
    const qty = parseFloat(newItemQuantity.replace(',', '.')) || 1

    // Bloqueio de filho em componente de terceiros (com mensagem em português)
    const erro = validarInclusaoFilho(parentNode, novoTipo)
    if (erro) {
      toast.error(erro)
      return
    }

    // Impedir ciclos: o novo item não pode ser ancestral de si mesmo
    const verificarCiclo = (codigo: string): boolean => {
      if (criariaCicloPorCodigo(parentNode, codigo)) {
        toast.error(
          `Ciclo detectado: o item "${codigo}" já existe na hierarquia acima. Um item não pode ser ancestral de si mesmo.`,
        )
        return true
      }
      return false
    }

    let novoItem: BomItem | null = null
    if (novoTipo === 'componente_terceiros') {
      if (!selectedComp) {
        toast.error('Selecione um componente da lista.')
        return
      }
      if (verificarCiclo(selectedComp.codigo)) return
      novoItem = {
        id: `novo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        bom_id: id,
        parent_id: parentNode.item.id,
        componente_id: selectedComp.id,
        nivel: parentNode.depth + 1,
        ordem: filhosDe(parentNode.item.id).length + 1,
        codigo: selectedComp.codigo,
        descricao: selectedComp.descricao,
        categoria: selectedComp.categoria,
        unidade: selectedComp.unidade,
        quantidade: qty,
        custo_unitario: Number(selectedComp.custo_unitario) || 0,
        fornecedor: selectedComp.fornecedor,
        tipo_linha: 'componente',
        item_tipo: 'componente_terceiros',
      }
    } else {
      const codigo = fabCodigo.trim().toUpperCase()
      const descricao = fabDescricao.trim()
      if (!codigo || !descricao) {
        toast.error('Código e descrição do item fabricado são obrigatórios.')
        return
      }
      if (verificarCiclo(codigo)) return
      novoItem = {
        id: `novo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        bom_id: id,
        parent_id: parentNode.item.id,
        nivel: parentNode.depth + 1,
        ordem: filhosDe(parentNode.item.id).length + 1,
        codigo,
        descricao,
        categoria: fabCategoria.trim() || 'Produção Interna',
        unidade: 'UN',
        quantidade: qty,
        custo_unitario: 0,
        fornecedor: 'Produção Interna',
        tipo_linha: 'submontagem',
        item_tipo: novoTipo,
      }
    }

    const itemFinal: BomItem = novoItem
    setItems((prev) => [...prev, itemFinal])
    toast.success(
      `${labelTipoItem(novoTipo)} "${itemFinal.descricao}" adicionado como filho de ${parentNode.item.codigo}.`,
    )
    setIsAddOpen(false)
  }

  const handleSaveAll = async () => {
    if (!id || !bom) return
    setIsSaving(true)
    try {
      await bomsService.saveAllItems(id, items)
      await bomsService.update(id, {
        overhead_percentual: overheadPct,
        margem_percentual: margemPct,
      })
      toast.success('BOM salvo com sucesso!')
      // Recarregar para sincronizar IDs gerados no banco
      const updated = await bomsService.getItems(id)
      setItems(updated)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao salvar itens do BOM.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-20 text-muted-foreground">Carregando editor de BOM...</div>
    )
  }

  if (!bom) return null

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-start gap-3">
          <Link to="/boms">
            <Button variant="ghost" size="icon" className="mt-0.5">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs font-bold text-primary">
                {bom.sku}
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{bom.nome}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {bom.descricao || 'Estrutura hierárquica multi-nível (árvore) e precificação'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/precificacao/${bom.id}`}>
            <Button variant="outline" className="gap-2">
              <Calculator className="h-4 w-4 text-emerald-600" />
              Ver Precificação
            </Button>
          </Link>
          <Button onClick={handleSaveAll} disabled={isSaving} className="gap-2 bg-primary">
            <Save className="h-4 w-4" />
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </div>

      {/* Painel Resumo Rápido de Custos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
          <p className="text-xs text-muted-foreground font-medium">
            Custo Consolidado de Materiais
          </p>
          <p className="text-2xl font-mono font-bold text-foreground mt-1">
            {formatBRL(custoConsolidado)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Rolagem recursiva da árvore</p>
        </div>

        <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
          <p className="text-xs text-muted-foreground font-medium">
            Overhead / Indiretos ({formatPercent(overheadPct)})
          </p>
          <p className="text-2xl font-mono font-bold text-amber-600 dark:text-amber-400 mt-1">
            {formatBRL((custoConsolidado * overheadPct) / 100)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Fábrica, energia e depreciação</p>
        </div>

        <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
          <p className="text-xs text-muted-foreground font-medium">
            Margem Alvo ({formatPercent(margemPct)})
          </p>
          <p className="text-2xl font-mono font-bold text-blue-600 dark:text-blue-400 mt-1">
            {formatBRL((custoConsolidado * margemPct) / 100)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Margem operacional esperada</p>
        </div>

        <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl shadow-sm">
          <p className="text-xs text-primary font-semibold">Preço Final Sugerido</p>
          <p className="text-2xl font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            {formatBRL(precoFinal)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {resultadoPricing.valido
              ? `Custo ÷ (1 − Σ%) — Σ% = ${formatPercent(resultadoPricing.sigmaPct)}`
              : resultadoPricing.erro}
          </p>
        </div>
      </div>

      {/* Árvore do BOM */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted/40 p-3 rounded-xl border border-border">
        <div className="flex items-center gap-2">
          <FolderTree className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm text-foreground">
            Árvore Multi-Nível do Produto
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleOpenAddChild(raizNode)}
          className="gap-1.5"
        >
          Adicionar Item na Raiz
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto shadow-sm">
        <BomTreeView
          bom={bom}
          items={items}
          onQuantidadeChange={handleQuantidadeChange}
          onCustoChange={handleCustoChange}
          onAddChild={handleOpenAddChild}
          onRemove={handleRemoveNode}
        />
      </div>

      {/* Modal Adicionar Item Filho */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Adicionar Item Filho de {parentNode?.item.codigo ?? '—'}</DialogTitle>
            <DialogDescription>
              {parentNode
                ? `Pai: ${labelTipoItem(parentNode.item.item_tipo)} — ${parentNode.item.descricao}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="novo-tipo">Tipo do Item</Label>
                <Select value={novoTipo} onValueChange={(val) => setNovoTipo(val as TipoItemBom)}>
                  <SelectTrigger id="novo-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ITEM_BOM.filter((t) => t.value !== 'produto_final').map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="item-qty">Quantidade no Pai</Label>
                <Input
                  id="item-qty"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(e.target.value)}
                  required
                />
              </div>
            </div>

            {novoTipo === 'componente_terceiros' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Buscar Componente de Terceiros no Catálogo</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Pesquisar por código, descrição ou categoria..."
                      className="pl-9"
                      value={searchComp}
                      onChange={(e) => setSearchComp(e.target.value)}
                    />
                  </div>
                </div>

                <div className="border border-border rounded-lg max-h-56 overflow-y-auto divide-y divide-border">
                  {compDisponiveis.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      Nenhum componente encontrado.
                    </div>
                  ) : (
                    compDisponiveis.slice(0, 30).map((c) => {
                      const isSelected = selectedComp?.id === c.id
                      return (
                        <div
                          key={c.id}
                          onClick={() => setSelectedComp(c)}
                          className={`p-2.5 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors ${
                            isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-primary">
                                {c.codigo}
                              </span>
                              <span className="text-xs text-muted-foreground">({c.categoria})</span>
                            </div>
                            <p className="text-xs font-medium text-foreground truncate">
                              {c.descricao}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{c.fornecedor}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-semibold text-xs text-emerald-700 dark:text-emerald-400">
                              {formatBRL(c.custo_unitario)}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {c.unidade}
                            </span>
                            {isSelected && <Check className="h-4 w-4 text-primary ml-auto mt-1" />}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5 text-xs text-muted-foreground">
                  Item fabricado: o custo unitário será <strong>calculado pelo sistema</strong> pela
                  soma dos custos de seus filhos — nunca digitado. Adicione filhos após inserir este
                  item.
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fab-code">Código do Item Fabricado *</Label>
                    <Input
                      id="fab-code"
                      value={fabCodigo}
                      onChange={(e) => setFabCodigo(e.target.value.toUpperCase())}
                      placeholder="Ex: SUB-EST-01"
                      className="font-mono uppercase"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fab-desc">Descrição *</Label>
                    <Input
                      id="fab-desc"
                      value={fabDescricao}
                      onChange={(e) => setFabDescricao(e.target.value)}
                      placeholder="Ex: Conjunto Gabinete Isolado"
                      required
                    />
                  </div>
                </div>

                <CategoriaProdutoSelector
                  id="fab-categoria"
                  label="Categoria do Item Fabricado"
                  value={fabCategoria}
                  onChange={setFabCategoria}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleAddConfirm}>
              Inserir Item no BOM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
