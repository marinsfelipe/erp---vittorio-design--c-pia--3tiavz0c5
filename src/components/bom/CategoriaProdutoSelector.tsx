import React, { useEffect, useState } from 'react'
import { categoriasProdutoService } from '@/services/categoriasProduto'
import type { CategoriaProduto } from '@/types/erp'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Tag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface CategoriaProdutoSelectorProps {
  value: string
  onChange: (val: string) => void
  label?: string
  id?: string
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function CategoriaProdutoSelector({
  value,
  onChange,
  label = 'Categoria do Equipamento',
  id = 'categoria-selector',
  placeholder = 'Selecione a categoria...',
  className = '',
  disabled = false,
}: CategoriaProdutoSelectorProps) {
  const { isAdmin } = useAuth()
  const [categorias, setCategorias] = useState<CategoriaProduto[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novaDescricao, setNovaDescricao] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const carregarCategorias = async (selecionarNome?: string) => {
    setIsLoading(true)
    try {
      const data = await categoriasProdutoService.getAll()
      setCategorias(data)
      if (selecionarNome) {
        onChange(selecionarNome)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    carregarCategorias()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAbrirCriar = (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    setNovoNome('')
    setNovaDescricao('')
    setIsDialogOpen(true)
  }

  const handleSalvarNovaCategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    const nomeLimpo = novoNome.trim()
    if (!nomeLimpo) {
      toast.error('Informe o nome da categoria.')
      return
    }

    setIsSubmitting(true)
    try {
      const criada = await categoriasProdutoService.create(nomeLimpo, novaDescricao)
      toast.success(`Categoria "${criada.nome}" criada com sucesso!`)
      setIsDialogOpen(false)
      setNovoNome('')
      setNovaDescricao('')
      // Recarrega e já deixa a categoria recém-criada selecionada
      await carregarCategorias(criada.nome)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao criar categoria de produto.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Se o valor atual não estiver na lista de categorias do banco, mas existir como texto (ex: legado),
  // incluímos na lista para não quebrar a exibição
  const nomesExistentes = categorias.map((c) => c.nome)
  const valorCustomizado = value && !nomesExistentes.includes(value) ? value : null

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        {label && (
          <Label htmlFor={id} className="text-xs font-medium text-foreground">
            {label}
          </Label>
        )}
        {isAdmin && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAbrirCriar}
            className="h-6 px-1.5 text-xs text-primary hover:text-primary/80 font-medium gap-1"
            title="Criar nova categoria de produto sem sair desta tela"
          >
            <Plus className="h-3 w-3" />
            Nova categoria
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Select value={value || ''} onValueChange={onChange} disabled={disabled || isLoading}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={isLoading ? 'Carregando categorias...' : placeholder}>
              {value ? (
                <span className="flex items-center gap-1.5 truncate">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{value}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {valorCustomizado && (
              <SelectItem value={valorCustomizado}>
                <span className="italic">{valorCustomizado} (atual)</span>
              </SelectItem>
            )}
            {categorias.length === 0 && !valorCustomizado ? (
              <div className="py-2 text-center text-xs text-muted-foreground">
                Nenhuma categoria cadastrada
              </div>
            ) : (
              categorias.map((cat) => (
                <SelectItem key={cat.id} value={cat.nome}>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{cat.nome}</span>
                    {cat.descricao && (
                      <span className="text-[10px] text-muted-foreground line-clamp-1">
                        {cat.descricao}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Modal de Criação Rápida de Categoria */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              Nova Categoria de Produto
            </DialogTitle>
            <DialogDescription>
              Cadastre uma nova categoria de produto. Ela ficará imediatamente disponível e
              selecionada.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarNovaCategoria} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="novo-nome-cat">Nome da Categoria *</Label>
              <Input
                id="novo-nome-cat"
                placeholder="Ex: Pistas Quentes, Auto-serviço..."
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nova-desc-cat">Descrição (opcional)</Label>
              <Input
                id="nova-desc-cat"
                placeholder="Ex: Equipamentos destinados a alimentos aquecidos"
                value={novaDescricao}
                onChange={(e) => setNovaDescricao(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-1.5">
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar Categoria
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default CategoriaProdutoSelector
