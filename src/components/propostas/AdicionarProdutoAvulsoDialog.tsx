import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatBRL } from '@/utils/formatters'
import { bomsService } from '@/services/boms'
import { propostasService } from '@/services/propostas'
import type { Bom } from '@/types/erp'
import { PlusCircle, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface AdicionarProdutoAvulsoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propostaId: string
  onSuccess: () => void
}

export function AdicionarProdutoAvulsoDialog({
  open,
  onOpenChange,
  propostaId,
  onSuccess,
}: AdicionarProdutoAvulsoDialogProps) {
  const [codigo, setCodigo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [unidade, setUnidade] = useState('UN')
  const [quantidade, setQuantidade] = useState('1')
  const [precoVenda, setPrecoVenda] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Lista de produtos existentes para sugestão/autocompletar
  const [produtosExistentes, setProdutosExistentes] = useState<Bom[]>([])
  const [produtoEncontrado, setProdutoEncontrado] = useState<Bom | null>(null)

  // Carregar produtos quando o diálogo abrir
  useEffect(() => {
    if (!open) {
      setCodigo('')
      setDescricao('')
      setUnidade('UN')
      setQuantidade('1')
      setPrecoVenda('')
      setProdutoEncontrado(null)
      return
    }

    const loadProdutos = async () => {
      try {
        const todos = await bomsService.getAll()
        setProdutosExistentes(todos)
      } catch (err) {
        console.warn('Erro ao carregar lista de produtos para sugestão:', err)
      }
    }
    loadProdutos()
  }, [open])

  // Monitorar digitação do código para detectar produto existente
  useEffect(() => {
    const codLimpo = codigo.trim().toUpperCase()
    if (!codLimpo) {
      setProdutoEncontrado(null)
      return
    }

    const match = produtosExistentes.find((p) => p.sku.trim().toUpperCase() === codLimpo)

    if (match) {
      setProdutoEncontrado(match)
      // Preencher campos automaticamente se o usuário não tiver preenchido
      if (match.nome) setDescricao(match.nome)
      if (match.unidade) setUnidade(match.unidade)
      const precoSugerido =
        match.preco_final_tabela !== undefined &&
        match.preco_final_tabela !== null &&
        match.preco_final_tabela > 0
          ? match.preco_final_tabela
          : match.preco_venda
      if (precoSugerido !== undefined && precoSugerido !== null && precoSugerido > 0) {
        setPrecoVenda(String(precoSugerido))
      }
    } else {
      setProdutoEncontrado(null)
    }
  }, [codigo, produtosExistentes])

  const handleSelectSugestao = (p: Bom) => {
    setCodigo(p.sku)
    setDescricao(p.nome)
    setUnidade(p.unidade || 'UN')
    const precoSugerido =
      p.preco_final_tabela !== undefined &&
      p.preco_final_tabela !== null &&
      p.preco_final_tabela > 0
        ? p.preco_final_tabela
        : p.preco_venda
    if (precoSugerido) setPrecoVenda(String(precoSugerido))
    setProdutoEncontrado(p)
  }

  const qtdNum = Math.max(1, parseFloat(quantidade) || 1)
  const precoNum = parseFloat(precoVenda.replace(',', '.')) || 0
  const subtotal = qtdNum * precoNum

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const skuFinal = codigo.trim().toUpperCase()
    const descFinal = descricao.trim()
    const unFinal = unidade.trim().toUpperCase() || 'UN'

    if (!skuFinal) {
      toast.error('Informe o código do produto.')
      return
    }
    if (!descFinal) {
      toast.error('Informe a descrição do produto.')
      return
    }
    if (qtdNum <= 0) {
      toast.error('Quantidade deve ser maior que zero.')
      return
    }
    if (precoNum <= 0) {
      toast.error('Informe um preço final de venda válido.')
      return
    }

    setIsSubmitting(true)
    try {
      let bomVinculado: Bom | null = produtoEncontrado

      // Se não encontrou no cache, tenta buscar diretamente no backend
      if (!bomVinculado) {
        bomVinculado = await bomsService.getBySku(skuFinal)
      }

      // Se não existir, cria no catálogo com flag preco_direto = true (sem BOM)
      if (!bomVinculado) {
        bomVinculado = await bomsService.create({
          sku: skuFinal,
          nome: descFinal,
          descricao: descFinal,
          categoria: 'Produto Avulso (Preço Direto)',
          preco_direto: true,
          preco_venda: precoNum,
          unidade: unFinal,
          overhead_percentual: 0,
          margem_percentual: 0,
        })
        toast.info(`Novo produto "${skuFinal}" cadastrado no catálogo como Preço Direto.`)
      } else {
        // Se já existe e é preço direto, atualiza o preço de venda e unidade se aplicável
        if (bomVinculado.preco_direto) {
          try {
            await bomsService.update(bomVinculado.id, {
              preco_venda: precoNum,
              unidade: unFinal,
              nome: descFinal,
            })
          } catch (errUpdate) {
            console.warn('Aviso ao atualizar preço do produto existente:', errUpdate)
          }
        }
      }

      // Adiciona o item na proposta
      await propostasService.addItem(propostaId, {
        bom_id: bomVinculado.id,
        sku: skuFinal,
        nome_produto: descFinal,
        quantidade: qtdNum,
        preco_unitario: precoNum,
        custo_unitario: 0, // Produto avulso com preço direto não tem custo industrial
        preco_direto: true,
        unidade: unFinal,
      })

      toast.success(`Produto avulso ${skuFinal} adicionado à proposta!`)
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao adicionar produto avulso à proposta.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filtrar sugestões de códigos existentes
  const sugestoes = codigo.trim()
    ? produtosExistentes
        .filter(
          (p) =>
            p.sku.toLowerCase().includes(codigo.toLowerCase()) ||
            p.nome.toLowerCase().includes(codigo.toLowerCase()),
        )
        .slice(0, 4)
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            <DialogTitle>Adicionar Produto Avulso</DialogTitle>
          </div>
          <DialogDescription>
            Informe o código e preço final direto (sem BOM). Produtos novos serão cadastrados no
            catálogo com preço direto e não participam do cálculo de custo nem rolagem hierárquica.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Código com autocompletar / detecção */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="codigo">Código do Produto *</Label>
              {produtoEncontrado ? (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-950/40"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Código Existente ({produtoEncontrado.preco_direto ? 'Preço Direto' : 'BOM'})
                </Badge>
              ) : codigo.trim() ? (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
                >
                  <Sparkles className="h-3 w-3" />
                  Novo no Catálogo
                </Badge>
              ) : null}
            </div>
            <Input
              id="codigo"
              placeholder="Ex: BALCAO-ESP-01, SERVICO-INST, CHAPA-AVULSA"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              autoFocus
              className="font-mono"
            />
            {/* Sugestões rápidas se houver correspondência parcial e não selecionado */}
            {sugestoes.length > 0 && !produtoEncontrado && (
              <div className="pt-1 flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground mr-1 self-center">Sugestões:</span>
                {sugestoes.map((sug) => (
                  <button
                    key={sug.id}
                    type="button"
                    onClick={() => handleSelectSugestao(sug)}
                    className="text-xs px-2 py-0.5 rounded border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 font-mono transition-colors"
                  >
                    {sug.sku} - {sug.nome.slice(0, 20)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição do Produto *</Label>
            <Input
              id="descricao"
              placeholder="Descrição completa do produto ou serviço"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          {/* Unidade e Quantidade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="unidade">Unidade *</Label>
              <Input
                id="unidade"
                placeholder="UN, PC, M, KG"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantidade">Quantidade *</Label>
              <Input
                id="quantidade"
                type="number"
                min="0.01"
                step="any"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
          </div>

          {/* Preço de Venda Direto */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="precoVenda">Preço Final de Venda Unitário (R$) *</Label>
              <span className="text-xs text-muted-foreground">Preço direto sem markup</span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
                R$
              </span>
              <Input
                id="precoVenda"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0,00"
                className="pl-10 font-mono text-base font-semibold"
                value={precoVenda}
                onChange={(e) => setPrecoVenda(e.target.value)}
              />
            </div>
          </div>

          {/* Resumo do Subtotal */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-center justify-between text-sm">
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">Subtotal do Item</span>
              <p className="font-semibold">
                {qtdNum} {unidade.trim().toUpperCase() || 'UN'} × {formatBRL(precoNum)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground">Total</span>
              <p className="text-lg font-bold font-mono text-primary">{formatBRL(subtotal)}</p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1">
            <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span>
              Este produto entra normalmente nos totais da proposta, no contrato e no faturamento,
              mas sem custo de matérias-primas e sem participar de ordens de compras industriais.
            </span>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              <PlusCircle className="h-4 w-4" />
              {isSubmitting ? 'Adicionando...' : 'Adicionar à Proposta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
