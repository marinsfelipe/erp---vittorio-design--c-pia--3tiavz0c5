import React, { useEffect, useState } from 'react'
import { bomsService } from '@/services/boms'
import { calcularMarkupDivisor, montarPercentuais } from '@/utils/pricing'
import { parametrosService } from '@/services/parametros'
import type { Bom, BomItem } from '@/types/erp'
import { montarArvore, calcularCustoConsolidado } from '@/utils/bomTree'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Plus,
  ArrowRight,
  PackageCheck,
  Calculator,
  Layers,
  Trash2,
  DollarSign,
  TrendingUp,
  Percent,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { Upload } from 'lucide-react'
import ImportarBomDialog from '@/components/bom/ImportarBomDialog'
import { CategoriaProdutoSelector } from '@/components/bom/CategoriaProdutoSelector'
import { categoriasProdutoService } from '@/services/categoriasProduto'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, SearchX } from 'lucide-react'
import { useEdicaoLote } from '@/hooks/useEdicaoLote'

interface BomWithStats extends Bom {
  itemCount: number
  custoTotal: number
  precoSugerido: number
}

export default function BomsPage() {
  const [boms, setBoms] = useState<BomWithStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [defaultParams, setDefaultParams] = useState({ overhead: 14.5, margem: 28.0 })

  const [formData, setFormData] = useState({
    sku: '',
    nome: '',
    descricao: '',
    categoria: 'Balcões Refrigerados',
    overhead_percentual: '14.5',
    margem_percentual: '28.0',
  })

  // Edição em lote (exclusivo do admin): categoria e NCM
  const [categoriasProduto, setCategoriasProduto] = useState<string[]>([])
  const [dialogoNcm, setDialogoNcm] = useState('')
  const lote = useEdicaoLote({
    rotuloItem: 'BOM',
    campos: [
      {
        key: 'categoria',
        label: 'Categoria do Equipamento',
        placeholderDinamico: '— não alterar —',
        opcoesDinamicas: categoriasProduto,
      },
      {
        key: 'ncm',
        label: 'NCM (8 dígitos)',
        placeholder: '— não alterar —',
        numerico8: true,
      },
    ],
    aplicar: async (ids, valores) => {
      // NCM em lote segue a MESMA regra da edição individual:
      // origem 'manual' + status pronto_nf => nunca sobrescrito pela classificação automática
      const payload: Record<string, unknown> = {}
      if (valores.categoria) payload.categoria = valores.categoria
      if (valores.ncm) {
        payload.ncm = valores.ncm
        payload.ncm_origem = 'manual'
        payload.ncm_status = 'pronto_nf'
        payload.ncm_classificado_em = new Date().toISOString()
      }
      const res = await bomsService.updateLote(ids, payload)
      return res
    },
    posAplicar: () => loadData(),
  })

  // Seleção no diálogo: campo NCM precisa ser digitado fora do Select dinâmico
  useEffect(() => {
    categoriasProdutoService
      .getAll()
      .then((cats) => setCategoriasProduto(cats.map((c) => c.nome)))
      .catch(() => {})
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [allBoms, paramsMap] = await Promise.all([
        bomsService.getAll(),
        parametrosService.getMap(),
      ])

      const defaultOverhead = paramsMap['overhead'] ?? 14.5
      const defaultMargem = paramsMap['margem_alvo'] ?? 28.0
      setDefaultParams({ overhead: defaultOverhead, margem: defaultMargem })

      // Carregar todos os itens em UMA listagem (evita rajada de 1 request por
      // BOM, que estoura o rate limit do backend — 429 — e derruba a página)
      const itemsMap = await bomsService.getAllItemsGrouped()

      const bomsWithStats: BomWithStats[] = allBoms.map((bom) => {
        const items: BomItem[] = itemsMap[bom.id] || []

        // Custo consolidado: rolagem recursiva da árvore multi-nível
        const custoTotal = calcularCustoConsolidado(montarArvore(bom, items).root)

        const overhead =
          bom.overhead_percentual !== undefined ? bom.overhead_percentual : defaultOverhead
        const margem = bom.margem_percentual !== undefined ? bom.margem_percentual : defaultMargem
        const precoSugerido = calcularMarkupDivisor(
          custoTotal,
          montarPercentuais(paramsMap, { overhead, margem }),
        ).precoVenda

        return {
          ...bom,
          itemCount: items.length,
          custoTotal,
          precoSugerido,
        }
      })

      setBoms(bomsWithStats)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar lista de BOMs')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Filtros: busca por texto (código/nome/descrição), categoria e tipo — deduzidos dos dados reais
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [filtroTipo, setFiltroTipo] = useState('todos')

  // Deselecionar tudo ao trocar busca ou filtro
  useEffect(() => {
    lote.limparSelecao()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filtroCategoria, filtroTipo])

  const categoriasBoms = Array.from(
    new Set(boms.map((b) => b.categoria || '').filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const bomsFiltrados = boms.filter((b) => {
    if (filtroCategoria !== 'todas' && (b.categoria || '') !== filtroCategoria) return false
    if (filtroTipo !== 'todos' && (b.ncm_status || '') !== filtroTipo) return false
    // "tipo" do BOM: status fiscal (pronto para NF / pendente fiscal), como na Tabela de Preços

    const q = searchTerm.trim().toLowerCase()
    if (!q) return true
    return (
      b.sku.toLowerCase().includes(q) ||
      b.nome.toLowerCase().includes(q) ||
      (b.descricao || '').toLowerCase().includes(q)
    )
  })

  const handleOpenCreate = () => {
    setFormData({
      sku: '',
      nome: '',
      descricao: '',
      categoria: 'Balcões Refrigerados',
      overhead_percentual: String(defaultParams.overhead),
      margem_percentual: String(defaultParams.margem),
    })
    setIsDialogOpen(true)
  }

  const handleCreateBom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.sku.trim() || !formData.nome.trim()) {
      toast.error('SKU e nome do produto são obrigatórios')
      return
    }

    try {
      const created = await bomsService.create({
        sku: formData.sku.trim().toUpperCase(),
        nome: formData.nome.trim(),
        descricao: formData.descricao.trim(),
        categoria: formData.categoria.trim(),
        overhead_percentual: parseFloat(formData.overhead_percentual) || defaultParams.overhead,
        margem_percentual: parseFloat(formData.margem_percentual) || defaultParams.margem,
      })
      toast.success(`BOM ${created.sku} criado com sucesso!`)
      setIsDialogOpen(false)
      loadData()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao criar BOM. Verifique se o SKU já existe.')
    }
  }

  const handleDelete = async (id: string, sku: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!window.confirm(`Tem certeza que deseja excluir o BOM ${sku} e todos os seus itens?`)) {
      return
    }
    setIsDeleting(id)
    try {
      await bomsService.delete(id)
      toast.success('BOM excluído com sucesso.')
      setBoms((prev) => prev.filter((b) => b.id !== id))
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir BOM')
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              BOMs por SKU de Produtos
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Estrutura de montagem de equipamentos de refrigeração comercial com precificação
            consolidada
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/parametros">
            <Button variant="outline" className="gap-2">
              <Percent className="h-4 w-4" />
              Parâmetros Financeiros
            </Button>
          </Link>
          <Button variant="outline" onClick={() => setIsImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Importar BOM
          </Button>
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo BOM (SKU)
          </Button>
        </div>
      </div>

      {/* Filtros: busca por texto, categoria e tipo */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código (SKU), nome ou descrição..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-full md:w-56">
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categoriasBoms.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-48">
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Status fiscal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Status fiscal: todos</SelectItem>
              <SelectItem value="pronto_nf">Pronto para NF</SelectItem>
              <SelectItem value="pendente_fiscal">Pendente fiscal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground md:ml-auto whitespace-nowrap">
          Exibindo <strong>{bomsFiltrados.length}</strong> de {boms.length} BOMs
        </span>
      </div>

      {/* Barra de edição em lote (só aparece com itens selecionados — admin) */}
      {lote.isAdmin && lote.barraSelecao}

      {/* Grid de Cards de BOMs */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">
          Carregando BOMs de produtos...
        </div>
      ) : boms.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <PackageCheck className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="font-semibold text-foreground text-lg">Nenhum BOM cadastrado</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Crie a primeira estrutura de produto para calcular custos de materiais, overhead e
              margem comercial.
            </p>
            <Button onClick={handleOpenCreate} className="mt-2">
              Criar Primeiro BOM
            </Button>
          </CardContent>
        </Card>
      ) : bomsFiltrados.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <SearchX className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="font-semibold text-foreground text-lg">Nenhum registro encontrado</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Tente ajustar a busca ou os filtros de categoria e status fiscal.
            </p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => {
                setSearchTerm('')
                setFiltroCategoria('todas')
                setFiltroTipo('todos')
              }}
            >
              Limpar filtros
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bomsFiltrados.map((bom) => (
            <Card
              key={bom.id}
              className="flex flex-col justify-between hover:shadow-md transition-all duration-200 border-border group"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {lote.isAdmin && lote.colunaCheckbox(bom.id)}
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
                      onClick={(e) => handleDelete(bom.id, bom.sku, e)}
                      disabled={isDeleting === bom.id}
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
                {/* Métricas e Indicadores de Custo */}
                <div className="bg-muted/40 p-3 rounded-lg space-y-2 border border-border/50">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Itens / Linhas:</span>
                    <span className="font-semibold text-foreground">
                      {bom.itemCount} componentes
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Custo Consolidado:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {formatBRL(bom.custoTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Σ% (Overhead + Margem):</span>
                    <span className="font-mono text-amber-700 dark:text-amber-400">
                      {formatPercent(
                        (bom.overhead_percentual ?? defaultParams.overhead) +
                          (bom.margem_percentual ?? defaultParams.margem),
                      )}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                      Preço Sugerido:
                    </span>
                    <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {formatBRL(bom.precoSugerido)}
                    </span>
                  </div>
                </div>

                {/* Ações Rápidas */}
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
          ))}
        </div>
      )}

      {/* Modal Criar BOM */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Novo BOM de Refrigeração Comercial</DialogTitle>
            <DialogDescription>
              Cadastre um novo SKU para iniciar a montagem estrutural de componentes e precificação.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBom} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sku">SKU do Produto *</Label>
                <Input
                  id="sku"
                  placeholder="Ex: BAL-INOX-180"
                  className="font-mono uppercase"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <CategoriaProdutoSelector
                id="categoria"
                label="Categoria do Equipamento"
                value={formData.categoria}
                onChange={(cat) => setFormData({ ...formData, categoria: cat })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome Comercial do Equipamento *</Label>
              <Input
                id="nome"
                placeholder="Ex: Balcão Frigorífico Inox 1.8m"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição / Aplicação</Label>
              <Input
                id="descricao"
                placeholder="Ex: Destinado à conservação e exposição de carnes e frios"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="overhead">Overhead Estimado (%)</Label>
                <Input
                  id="overhead"
                  type="number"
                  step="0.1"
                  value={formData.overhead_percentual}
                  onChange={(e) =>
                    setFormData({ ...formData, overhead_percentual: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="margem">Margem Alvo Desejada (%)</Label>
                <Input
                  id="margem"
                  type="number"
                  step="0.1"
                  value={formData.margem_percentual}
                  onChange={(e) => setFormData({ ...formData, margem_percentual: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar BOM</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Importar BOMs */}
      <ImportarBomDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImported={loadData} />

      {lote.dialogo}
      {lote.confirmDialog}
    </div>
  )
}
