import React, { useEffect, useMemo, useState } from 'react'
import { bomsService } from '@/services/boms'
import { componentesService } from '@/services/componentes'
import { calcularMarkupDivisor, montarPercentuais } from '@/utils/pricing'
import { parametrosService } from '@/services/parametros'
import type { Bom, BomItem, Componente } from '@/types/erp'
import { podePossuirBOM } from '@/types/erp'
import { montarArvore, calcularCustoConsolidado, montarContextoCusto } from '@/utils/bomTree'
import { NovaBomDialog } from '@/components/bom/NovaBomDialog'
import { CardBomExistente, CardItemSemBom } from '@/components/bom/CardsBoms'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { Upload } from 'lucide-react'
import ImportarBomDialog from '@/components/bom/ImportarBomDialog'
import { ReaproveitarListaDialog } from '@/components/bom/ReaproveitarListaDialog'

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
import { normalizarBusca } from '@/utils/textDecode'

interface BomWithStats extends Bom {
  itemCount: number
  custoTotal: number
  precoSugerido: number
}

export default function BomsPage() {
  const [boms, setBoms] = useState<BomWithStats[]>([])
  const [componentes, setComponentes] = useState<Componente[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isReaproveitarOpen, setIsReaproveitarOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [defaultParams, setDefaultParams] = useState({ overhead: 14.5, margem: 28.0 })
  // Item pré-selecionado no diálogo (aberto pelo botão "Criar BOM" do card)
  const [itemPreSelecionado, setItemPreSelecionado] = useState<Componente | null>(null)

  // (O estado do formulário de criação mora no NovaBomDialog.)

  // Edição em lote (exclusivo do admin): categoria e NCM
  const [categoriasProduto, setCategoriasProduto] = useState<string[]>([])
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
      const [itemsMap, allComponentes] = await Promise.all([
        bomsService.getAllItemsGrouped(),
        componentesService.getAll(),
      ])

      // Contexto aninhado (todos os BOMs + itens) para a rolagem descer nos
      // sub-BOMs — custo puro, percentuais nunca em nível intermediário.
      // Computado em CONST local (não em estado): a closure de loadData captura
      // o valor da própria carga — em recargas (ex.: posAplicar do lote) o
      // estado antigo seria nulo/obsoleto.
      const contextoCustoLocal = montarContextoCusto(itemsMap, allBoms)

      const bomsWithStats: BomWithStats[] = allBoms.map((bom) => {
        const items: BomItem[] = itemsMap[bom.id] || []

        // Custo consolidado: rolagem recursiva da árvore multi-nível, com
        // explosão aninhada nos sub-BOMs — custo puro, sem percentuais em
        // nível intermediário (percentuais só na raiz produto final)
        const custoTotal = calcularCustoConsolidado(
          montarArvore(bom, items).root,
          contextoCustoLocal,
        )

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
      setComponentes(allComponentes)
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
    new Set(componentes.map((c) => c.categoria || '').filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  // Lista AMPLIADA: todo item do catálogo que PODE possuir BOM (produto final,
  // semi-acabado, componente interno, KIT). Terceiros ficam só em /componentes.
  // Cada linha vira { tipo, comp?, bom? }: comp = card "sem BOM" (com botão
  // Criar BOM), bom = card atual (métricas + editor + precificação).
  const linhas = useMemo(() => {
    const bomPorSku = new Map(boms.map((b) => [(b.sku || '').trim().toUpperCase(), b] as const))
    const skusComBom = new Set(bomPorSku.keys())

    const resultado: Array<
      | { tipo: 'com_bom'; chave: string; bom: BomWithStats }
      | { tipo: 'sem_bom'; chave: string; comp: Componente }
    > = []

    // 1) BOMs cujo SKU não tem mais cadastro de componente (legado) continuam visíveis
    for (const bom of boms) {
      const sku = (bom.sku || '').trim().toUpperCase()
      const comp = componentes.find((c) => (c.codigo || '').trim().toUpperCase() === sku)
      if (!comp) {
        resultado.push({ tipo: 'com_bom', chave: bom.id, bom })
      }
    }

    // 2) Todo componente que pode possuir BOM entra na lista
    for (const comp of componentes) {
      if (!podePossuirBOM(comp.tipo, comp.categoria)) continue
      const sku = (comp.codigo || '').trim().toUpperCase()
      const bom = bomPorSku.get(sku)
      if (bom) {
        resultado.push({ tipo: 'com_bom', chave: `bom-${bom.id}`, bom })
      } else {
        resultado.push({ tipo: 'sem_bom', chave: `comp-${comp.id}`, comp })
      }
    }

    return resultado
  }, [boms, componentes])

  const bomsFiltrados = linhas.filter((l) => {
    if (filtroCategoria !== 'todas') {
      const cat = l.tipo === 'com_bom' ? l.bom.categoria || '' : l.comp.categoria || ''
      if (cat !== filtroCategoria) return false
    }
    if (filtroTipo !== 'todos') {
      const st = l.tipo === 'com_bom' ? l.bom.ncm_status || '' : ''
      if (st !== filtroTipo) return false
    }
    // "tipo" do filtro: status fiscal (pronto para NF / pendente fiscal)

    const q = normalizarBusca(searchTerm)
    if (!q) return true
    if (l.tipo === 'com_bom') {
      return (
        normalizarBusca(l.bom.sku).includes(q) ||
        normalizarBusca(l.bom.nome).includes(q) ||
        normalizarBusca(l.bom.descricao || '').includes(q)
      )
    }
    return (
      normalizarBusca(l.comp.codigo || '').includes(q) ||
      normalizarBusca(l.comp.descricao || '').includes(q) ||
      normalizarBusca(l.comp.fornecedor || '').includes(q)
    )
  })

  // Diálogo de BOM aninhada: raiz escolhida por busca (produto final,
  // semi-acabado, componente interno ou KIT — regra podePossuirBOM).
  const handleOpenCreate = () => {
    setItemPreSelecionado(null)
    setIsDialogOpen(true)
  }

  // Botão "Criar BOM" do card sem BOM: abre o diálogo já com o item pré-selecionado
  const handleCriarBomItem = (comp: Componente) => {
    setItemPreSelecionado(comp)
    setIsDialogOpen(true)
  }

  const handleBomCriada = async (_bom: Bom) => {
    // Recarrega a lista: a BOM nova entra com o item raiz nível 1 já gravado.
    setItemPreSelecionado(null)
    await loadData()
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
            Itens que podem possuir BOM (produto final, semi-acabado, componente interno e KIT) com
            precificação consolidada — componentes de terceiros ficam em Componentes
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
          {lote.isAdmin && (
            <Button variant="outline" onClick={() => setIsReaproveitarOpen(true)} className="gap-2">
              <Copy className="h-4 w-4" />
              Reaproveitar lista
            </Button>
          )}
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
          Exibindo <strong>{bomsFiltrados.length}</strong> de {linhas.length} itens
        </span>
      </div>

      {/* Barra de edição em lote (só aparece com itens selecionados — admin) */}
      {lote.isAdmin && lote.barraSelecao}

      {/* Grid de Cards */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">
          Carregando BOMs de produtos...
        </div>
      ) : linhas.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <PackageCheck className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="font-semibold text-foreground text-lg">Nenhum item elegível a BOM</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Cadastre produtos finais, semi-acabados, componentes internos ou KITs em Componentes
              para montar estruturas de custo aqui.
            </p>
            <Link to="/componentes">
              <Button className="mt-2">Ir para Componentes</Button>
            </Link>
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
          {bomsFiltrados.map((linha) =>
            linha.tipo === 'com_bom' ? (
              <CardBomExistente
                key={linha.chave}
                bom={linha.bom}
                itemCount={linha.bom.itemCount}
                custoTotal={linha.bom.custoTotal}
                precoSugerido={linha.bom.precoSugerido}
                isAdmin={lote.isAdmin}
                loteColunaCheckbox={lote.colunaCheckbox}
                isDeleting={isDeleting === linha.bom.id}
                onDelete={(e) => handleDelete(linha.bom.id, linha.bom.sku, e)}
                defaultOverhead={defaultParams.overhead}
                defaultMargem={defaultParams.margem}
              />
            ) : (
              <CardItemSemBom
                key={linha.chave}
                comp={linha.comp}
                isAdmin={lote.isAdmin}
                onCriarBom={handleCriarBomItem}
              />
            ),
          )}
        </div>
      )}

      {/* Modal Criar BOM (aninhada: raiz por busca, podePossuirBOM) */}
      <NovaBomDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        bomsExistentes={boms}
        onCreated={handleBomCriada}
        defaultOverhead={defaultParams.overhead}
        defaultMargem={defaultParams.margem}
        itemPreSelecionado={itemPreSelecionado}
      />

      {/* Modal Importar BOMs */}
      <ImportarBomDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImported={loadData} />

      {/* Modal Reaproveitar lista (exclusivo do admin) */}
      {lote.isAdmin && (
        <ReaproveitarListaDialog
          open={isReaproveitarOpen}
          onOpenChange={setIsReaproveitarOpen}
          boms={boms}
          onCopied={loadData}
        />
      )}

      {lote.dialogo}
      {lote.confirmDialog}
    </div>
  )
}
