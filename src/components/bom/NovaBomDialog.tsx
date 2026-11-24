import { useEffect, useMemo, useState } from 'react'
import type { Bom, BomItem, TipoItemBom } from '@/types/erp'
import { labelTipoItem, TIPOS_ITEM_BOM } from '@/types/erp'
import { componentesService } from '@/services/componentes'
import { bomsService } from '@/services/boms'
import { CategoriaProdutoSelector } from '@/components/bom/CategoriaProdutoSelector'
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
import { Search, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { formatBRL } from '@/utils/formatters'
import { podePossuirBOM } from '@/types/erp'

export interface NovaBomForm {
  sku: string
  nome: string
  descricao: string
  categoria: string
  tipoRaiz: TipoItemBom
  overhead_percentual: number
  margem_percentual: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** BOMs existentes — para bloquear item que já é raiz de outra BOM. */
  bomsExistentes: Bom[]
  onCreated: (bom: Bom) => void
  defaultOverhead: number
  defaultMargem: number
}

/**
 * Diálogo de criação de BOM com raiz ANINHADA: a raiz pode ser produto final,
 * semi-acabado, componente interno ou KIT-montagem interna (regra podePossuirBOM —
 * componente de terceiros NÃO tem BOM). A busca do item raiz é por código/nome
 * (mesma UX do seletor do editor), mostrando tipo e categoria. Item que já é
 * raiz de outra BOM é bloqueado com aviso claro.
 */
export function NovaBomDialog({
  open,
  onOpenChange,
  bomsExistentes,
  onCreated,
  defaultOverhead,
  defaultMargem,
}: Props) {
  const [componentes, setComponentes] = useState<
    Array<{ id: string; codigo: string; descricao: string; categoria: string; tipo?: string }>
  >([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<{
    codigo: string
    descricao: string
    categoria: string
    tipo?: string
  } | null>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('Balcões Refrigerados')
  const [tipoRaiz, setTipoRaiz] = useState<TipoItemBom>('produto_final')
  const [overhead, setOverhead] = useState(String(defaultOverhead))
  const [margem, setMargem] = useState(String(defaultMargem))
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open)
      return componentesService
        .getAll()
        .then((comps) => setComponentes(comps))
        .catch(() => toast.error('Erro ao carregar componentes'))
  }, [open])

  // Skus que já são raiz de BOM — bloqueia criação duplicada
  const skusRaiz = useMemo(
    () => new Set(bomsExistentes.map((b) => (b.sku || '').trim().toUpperCase())),
    [bomsExistentes],
  )

  const resultados = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return componentes
      .filter((c) => `${c.codigo} ${c.descricao}`.toLowerCase().includes(q))
      .slice(0, 30)
  }, [componentes, search])

  const reset = () => {
    setSearch('')
    setSelected(null)
    setNome('')
    setDescricao('')
    setCategoria('Balcões Refrigerados')
    setTipoRaiz('produto_final')
    setOverhead(String(defaultOverhead))
    setMargem(String(defaultMargem))
  }

  const handleClose = (o: boolean) => {
    if (!o) reset()
    onOpenChange(o)
  }

  const selecionar = (c: (typeof componentes)[number]) => {
    const sku = c.codigo.trim().toUpperCase()
    if (!podePossuirBOM(c.tipo, c.categoria)) {
      toast.error(
        'Componente de Terceiros não pode ter BOM — é um item comprado (folha). Escolha um semi-acabado, componente interno, KIT ou produto final.',
      )
      return
    }
    if (skusRaiz.has(sku)) {
      toast.error(`O item ${sku} já é raiz de outra BOM. Não é possível criar BOM duplicada.`)
      return
    }
    setSelected({ codigo: sku, descricao: c.descricao, categoria: c.categoria, tipo: c.tipo })
    if (!nome) setNome(c.descricao)
  }

  const handleCreate = async () => {
    if (!selected) {
      toast.error('Selecione o item raiz da BOM (busca por código ou nome).')
      return
    }
    if (!nome.trim()) {
      toast.error('Informe o nome do produto/semiacabado.')
      return
    }
    const sku = selected.codigo.trim().toUpperCase()
    if (skusRaiz.has(sku)) {
      toast.error(`O item ${sku} já é raiz de outra BOM. Não é possível criar BOM duplicada.`)
      return
    }
    setIsSaving(true)
    try {
      const created = await bomsService.create({
        sku,
        nome: nome.trim(),
        descricao: descricao.trim(),
        categoria: (selected.categoria || categoria || '').trim(),
        overhead_percentual: parseFloat(overhead) || defaultOverhead,
        margem_percentual: parseFloat(margem) || defaultMargem,
      } as any)
      // Item raiz gravado como nível 1, tipo escolhido (padrão do banco: raiz
      // sempre nível 1; tipo produto_final para produto acabado).
      await bomsService.createItem({
        bom_id: created.id,
        nivel: 1,
        ordem: 1,
        codigo: sku,
        descricao: nome.trim(),
        categoria: (selected.categoria || categoria || '').trim(),
        unidade: 'UN',
        quantidade: 1,
        custo_unitario: 0,
        fornecedor: '',
        tipo_linha: 'submontagem',
        parent_id: '',
        item_tipo: tipoRaiz,
      } as any)
      toast.success(`BOM ${created.sku} criada com sucesso!`)
      onCreated(created)
      reset()
      onOpenChange(false)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao criar BOM. Verifique se o SKU já existe.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Nova BOM</DialogTitle>
          <DialogDescription>
            Escolha a raiz: produto final, semi-acabado, componente interno ou KIT-montagem interna.
            Componente de terceiros não pode ter BOM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Passo 1 — busca do item raiz */}
          <div className="space-y-2">
            <Label>Item raiz (busca por código ou nome) *</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex: SEM-BALC-01 ou Balcão Inox..."
                className="pl-9"
                value={selected ? `${selected.codigo} — ${selected.descricao}` : search}
                onChange={(e) => {
                  setSelected(null)
                  setSearch(e.target.value)
                }}
              />
            </div>
            {selected && (
              <div className="flex items-center gap-2 text-xs bg-primary/5 border border-primary/20 rounded-lg p-2">
                <Check className="h-4 w-4 text-primary" />
                <Badge variant="outline" className="text-[10px]">
                  {labelTipoItem(selected.tipo)}
                </Badge>
                <span className="font-mono font-semibold">{selected.codigo}</span>
                <span className="truncate">{selected.descricao}</span>
              </div>
            )}
            {!selected && resultados.length > 0 && (
              <div className="border border-border rounded-lg max-h-52 overflow-y-auto divide-y divide-border">
                {resultados.map((c) => {
                  const ehRaizDuplicada = skusRaiz.has(c.codigo.trim().toUpperCase())
                  const semBom = !podePossuirBOM(c.tipo, c.categoria)
                  return (
                    <div
                      key={c.id}
                      onClick={() => selecionar(c)}
                      className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                        semBom || ehRaizDuplicada
                          ? 'opacity-60 cursor-not-allowed bg-muted/30'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-primary">
                            {c.codigo}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {labelTipoItem(c.tipo)}
                          </Badge>
                          {c.categoria && (
                            <span className="text-[10px] text-muted-foreground">
                              ({c.categoria})
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-foreground truncate">
                          {c.descricao}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {semBom ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-destructive border-destructive/40 gap-1"
                          >
                            <AlertTriangle className="h-3 w-3" /> Sem BOM
                          </Badge>
                        ) : ehRaizDuplicada ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-700 border-amber-500/40 gap-1"
                          >
                            <AlertTriangle className="h-3 w-3" /> Já é raiz
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Passo 2 — tipo da raiz */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo da raiz (nível 1) *</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={tipoRaiz}
                onChange={(e) => setTipoRaiz(e.target.value as TipoItemBom)}
              >
                {TIPOS_ITEM_BOM.filter((t) => t.value !== 'componente_terceiros').map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <CategoriaProdutoSelector
              id="categoria"
              label="Categoria"
              value={categoria}
              onChange={setCategoria}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nb-nome">Nome *</Label>
              <Input
                id="nb-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Balcão Frigorífico Inox 1.8m"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-desc">Descrição / Aplicação</Label>
              <Input
                id="nb-desc"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Destinado à conservação e exposição de frios"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="nb-overhead">Overhead Estimado (%)</Label>
              <Input
                id="nb-overhead"
                type="number"
                step="0.1"
                value={overhead}
                onChange={(e) => setOverhead(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-margem">Margem Alvo Desejada (%)</Label>
              <Input
                id="nb-margem"
                type="number"
                step="0.1"
                value={margem}
                onChange={(e) => setMargem(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleCreate} disabled={isSaving}>
            {isSaving ? 'Criando...' : 'Criar BOM'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
