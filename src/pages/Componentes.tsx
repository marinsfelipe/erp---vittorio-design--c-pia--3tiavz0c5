import React, { useEffect, useState } from 'react'
import { componentesService } from '@/services/componentes'
import { SearchX } from 'lucide-react'
import type { Componente, TipoItemBom } from '@/types/erp'
import { TIPOS_ITEM_BOM, labelTipoItem } from '@/types/erp'
import { formatBRL } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Search, Edit2, Trash2, FileSpreadsheet, RefreshCw, Cpu, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { useEdicaoLote } from '@/hooks/useEdicaoLote'
import type { CampoLote } from '@/hooks/useEdicaoLote'
import { normalizarBusca, normalizarTexto } from '@/utils/textDecode'
import { Checkbox } from '@/components/ui/checkbox'

const CAMPOS_LOTE_COMPONENTES: CampoLote[] = [
  { key: 'tipo', label: 'Tipo', opcoes: TIPOS_ITEM_BOM },
  {
    key: 'unidade',
    label: 'Unidade',
    opcoes: [
      { value: 'UN', label: 'UN - Unidade' },
      { value: 'KG', label: 'KG - Quilograma' },
      { value: 'M', label: 'M - Metro Linear' },
      { value: 'M2', label: 'M² - Metro Quadrado' },
      { value: 'PC', label: 'PC - Peça' },
      { value: 'CJ', label: 'CJ - Conjunto' },
      { value: 'L', label: 'L - Litro' },
    ],
  },
  {
    key: 'categoria',
    label: 'Categoria',
    placeholder: 'Ex: Refrigeração, Vidros...',
  },
  { key: 'fornecedor', label: 'Fornecedor Principal', placeholder: 'Ex: Embraco, Full Gauge...' },
]

export default function ComponentesPage() {
  const [todosComponentes, setTodosComponentes] = useState<Componente[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategoria, setSelectedCategoria] = useState('todas')
  const [selectedUnidade, setSelectedUnidade] = useState('todas')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<Componente | null>(null)

  // Formulário
  const [formData, setFormData] = useState({
    codigo: '',
    descricao: '',
    categoria: 'Refrigeração',
    unidade: 'UN',
    custo_unitario: '',
    fornecedor: '',
    tipo: 'componente_terceiros' as TipoItemBom,
  })

  // Carrega TODOS os componentes em UMA listagem e filtra no cliente
  // (evita refazer a consulta a cada tecla / troca de filtro)
  const loadData = async () => {
    setIsLoading(true)
    try {
      const data = await componentesService.getAll()
      setTodosComponentes(data)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar componentes')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Edição em lote (exclusivo do admin)
  const lote = useEdicaoLote({
    rotuloItem: 'componente',
    campos: CAMPOS_LOTE_COMPONENTES,
    aplicar: async (ids, valores) => {
      let atualizados = 0
      let erros = 0
      // Updates EM SÉRIE — rajada Promise.all estoura o rate limit (429)
      for (const id of ids) {
        try {
          await componentesService.update(id, valores)
          atualizados++
        } catch (err) {
          console.error('Erro ao atualizar componente em lote:', id, err)
          erros++
        }
      }
      return { atualizados, erros }
    },
    posAplicar: () => {
      loadData()
    },
  })

  // Deselecionar tudo ao trocar busca ou filtro
  useEffect(() => {
    lote.limparSelecao()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedCategoria, selectedUnidade])

  const normalizar = normalizarBusca

  const categorias = Array.from(
    new Set(todosComponentes.map((c) => c.categoria).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const unidades = Array.from(new Set(todosComponentes.map((c) => c.unidade).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, 'pt-BR'),
  )

  const componentes = todosComponentes.filter((c) => {
    if (selectedCategoria !== 'todas' && c.categoria !== selectedCategoria) return false
    if (selectedUnidade !== 'todas' && c.unidade !== selectedUnidade) return false

    const q = normalizar(searchTerm.trim())
    if (!q) return true
    return (
      normalizar(c.codigo).includes(q) ||
      normalizar(c.descricao).includes(q) ||
      normalizar(c.fornecedor || '').includes(q)
    )
  })

  const handleOpenCreate = () => {
    setEditingItem(null)
    setFormData({
      codigo: '',
      descricao: '',
      categoria: 'Refrigeração',
      unidade: 'UN',
      custo_unitario: '',
      fornecedor: '',
      tipo: 'componente_terceiros',
    })
    setIsDialogOpen(true)
  }

  const handleOpenEdit = (comp: Componente) => {
    setEditingItem(comp)
    setFormData({
      codigo: comp.codigo,
      descricao: comp.descricao,
      categoria: comp.categoria,
      unidade: comp.unidade,
      custo_unitario: String(comp.custo_unitario),
      fornecedor: comp.fornecedor,
      tipo: (comp.tipo ?? 'componente_terceiros') as TipoItemBom,
    })
    setIsDialogOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.codigo.trim() || !formData.descricao.trim()) {
      toast.error('Código e descrição são obrigatórios.')
      return
    }

    const custo = parseFloat(formData.custo_unitario.replace(',', '.')) || 0

    try {
      if (editingItem) {
        await componentesService.update(editingItem.id, {
          codigo: normalizarTexto(formData.codigo).toUpperCase(),
          descricao: normalizarTexto(formData.descricao),
          categoria: normalizarTexto(formData.categoria),
          unidade: normalizarTexto(formData.unidade).toUpperCase(),
          custo_unitario: custo,
          fornecedor: normalizarTexto(formData.fornecedor),
          tipo: formData.tipo,
        })
        toast.success('Componente atualizado com sucesso!')
      } else {
        await componentesService.create({
          codigo: normalizarTexto(formData.codigo).toUpperCase(),
          descricao: normalizarTexto(formData.descricao),
          categoria: normalizarTexto(formData.categoria),
          unidade: normalizarTexto(formData.unidade).toUpperCase(),
          custo_unitario: custo,
          fornecedor: normalizarTexto(formData.fornecedor),
          tipo: formData.tipo,
        })
        toast.success('Componente cadastrado com sucesso!')
      }
      setIsDialogOpen(false)
      loadData()
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || 'Erro ao salvar componente. Verifique se o código é único.')
    }
  }

  const handleDelete = async (id: string, codigo: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o componente ${codigo}?`)) {
      return
    }
    setIsDeleting(id)
    try {
      await componentesService.delete(id)
      toast.success('Componente excluído.')
      setTodosComponentes((prev) => prev.filter((c) => c.id !== id))
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir componente.')
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Catálogo de Componentes
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Peças, insumos frigoríficos, perfis, vidros e componentes para montagem de equipamentos
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/importar">
            <Button variant="outline" className="gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Importar Planilha
            </Button>
          </Link>
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Componente
          </Button>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, descrição ou fornecedor..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-full md:w-56">
          <Select value={selectedCategoria} onValueChange={setSelectedCategoria}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Filtrar por Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categorias.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-40">
          <Select value={selectedUnidade} onValueChange={setSelectedUnidade}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as unidades</SelectItem>
              {unidades.map((un) => (
                <SelectItem key={un} value={un}>
                  {un}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="icon" onClick={loadData} title="Atualizar">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
        <span className="text-xs text-muted-foreground md:ml-auto whitespace-nowrap">
          Exibindo <strong>{componentes.length}</strong> de {todosComponentes.length} componentes
        </span>
      </div>

      {/* Barra de edição em lote (só aparece com itens selecionados — admin) */}
      {lote.isAdmin && lote.barraSelecao}

      {/* Tabela de Componentes */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {lote.isAdmin && (
                <TableHead className="w-10 font-semibold">
                  {lote.cabecalhoSelecao(componentes.map((c) => c.id))}
                </TableHead>
              )}
              <TableHead className="w-32 font-semibold">Código</TableHead>
              <TableHead className="font-semibold">Descrição</TableHead>
              <TableHead className="w-44 font-semibold">Categoria</TableHead>
              <TableHead className="w-44 font-semibold">Tipo</TableHead>
              <TableHead className="w-20 font-semibold text-center">Unid.</TableHead>
              <TableHead className="w-36 font-semibold text-right">Custo Unitário</TableHead>
              <TableHead className="w-52 font-semibold">Fornecedor Principal</TableHead>
              <TableHead className="w-24 font-semibold text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={lote.isAdmin ? 9 : 8}
                  className="text-center py-12 text-muted-foreground"
                >
                  Carregando componentes cadastrados...
                </TableCell>
              </TableRow>
            ) : componentes.length === 0 ? (
              todosComponentes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={lote.isAdmin ? 9 : 8} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Layers className="h-10 w-10 text-muted-foreground/50" />
                      <p className="font-medium text-foreground">Nenhum componente encontrado</p>
                      <p className="text-xs text-muted-foreground">
                        Tente alterar os termos de busca ou cadastre um novo item.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenCreate}
                        className="mt-2"
                      >
                        Adicionar Componente
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={lote.isAdmin ? 9 : 8} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <SearchX className="h-10 w-10 text-muted-foreground/50" />
                      <p className="font-medium text-foreground">Nenhum registro encontrado</p>
                      <p className="text-xs text-muted-foreground">
                        Tente ajustar a busca ou os filtros de categoria e unidade.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          setSearchTerm('')
                          setSelectedCategoria('todas')
                          setSelectedUnidade('todas')
                        }}
                      >
                        Limpar filtros
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            ) : (
              componentes.map((comp) => (
                <TableRow key={comp.id} className="hover:bg-muted/40 transition-colors">
                  {lote.isAdmin && (
                    <TableCell className="w-10">{lote.colunaCheckbox(comp.id)}</TableCell>
                  )}
                  <TableCell className="font-mono font-semibold text-primary">
                    {comp.codigo}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{comp.descricao}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal text-xs">
                      {comp.categoria}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{labelTipoItem(comp.tipo)}</TableCell>
                  <TableCell className="text-center text-xs font-mono font-medium">
                    {comp.unidade}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatBRL(comp.custo_unitario)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {comp.fornecedor || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleOpenEdit(comp)}
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(comp.id, comp.codigo)}
                        disabled={isDeleting === comp.id}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="px-4 py-3 bg-muted/20 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Total exibido: <strong>{componentes.length}</strong> itens
          </span>
          <span>Atualizado em tempo real com Skip Cloud</span>
        </div>
      </div>

      {/* Modal Adicionar / Editar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? `Editar Componente: ${editingItem.codigo}`
                : 'Novo Componente Frigorífico'}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados do componente para uso no catálogo de engenharia e BOMs.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="codigo">Código / Part Number *</Label>
                <Input
                  id="codigo"
                  placeholder="Ex: CMP-0103"
                  className="font-mono uppercase"
                  value={formData.codigo}
                  onChange={(e) =>
                    setFormData({ ...formData, codigo: e.target.value.toUpperCase() })
                  }
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unidade">Unidade de Medida *</Label>
                <Select
                  value={formData.unidade}
                  onValueChange={(val) => setFormData({ ...formData, unidade: val })}
                >
                  <SelectTrigger id="unidade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UN">UN - Unidade</SelectItem>
                    <SelectItem value="KG">KG - Quilograma</SelectItem>
                    <SelectItem value="M">M - Metro Linear</SelectItem>
                    <SelectItem value="M2">M² - Metro Quadrado</SelectItem>
                    <SelectItem value="PC">PC - Peça</SelectItem>
                    <SelectItem value="CJ">CJ - Conjunto</SelectItem>
                    <SelectItem value="L">L - Litro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição do Componente / Especificação *</Label>
              <Input
                id="descricao"
                placeholder="Ex: Compressor Scroll 1HP R404A 220V 60Hz"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="categoria">Categoria Técnica</Label>
                <Input
                  id="categoria"
                  placeholder="Ex: Refrigeração, Vidros..."
                  value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custo_unitario">Custo Unitário (R$) *</Label>
                <Input
                  id="custo_unitario"
                  placeholder="0,00"
                  value={formData.custo_unitario}
                  onChange={(e) => setFormData({ ...formData, custo_unitario: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fornecedor">Fornecedor Principal / Fabricante</Label>
              <Input
                id="fornecedor"
                placeholder="Ex: Embraco, Full Gauge, Dow..."
                value={formData.fornecedor}
                onChange={(e) => setFormData({ ...formData, fornecedor: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <Select
                value={formData.tipo}
                onValueChange={(val) => setFormData({ ...formData, tipo: val as TipoItemBom })}
              >
                <SelectTrigger id="tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ITEM_BOM.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingItem ? 'Salvar Alterações' : 'Cadastrar Componente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {lote.dialogo}
      {lote.confirmDialog}
    </div>
  )
}
