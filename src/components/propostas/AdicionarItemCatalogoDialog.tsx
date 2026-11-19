import { useState, useEffect, useMemo } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { formatBRL } from '@/utils/formatters'
import { bomsService } from '@/services/boms'
import { propostasService, calcularCustoConsolidado } from '@/services/propostas'
import { montarPercentuais, calcularMarkupDivisor } from '@/utils/pricing'
import type { Bom } from '@/types/erp'
import { PlusCircle, CheckCircle2, Search, Package } from 'lucide-react'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { parametrosService } from '@/services/parametros'

interface AdicionarItemCatalogoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propostaId: string
  skusExistentes: string[]
  onSuccess: () => void
}

/**
 * Seletor de itens do catálogo (BOMs) para ADICIONAR a uma proposta existente.
 * Usa o mesmo preço e custo da criação de proposta (markup divisor com os
 * percentuais da tabela de parâmetros + override de overhead/margem do SKU).
 * Carrega BOMs e parâmetros em UMA listagem cada (anti rate limit 429).
 */
export function AdicionarItemCatalogoDialog({
  open,
  onOpenChange,
  propostaId,
  skusExistentes,
  onSuccess,
}: AdicionarItemCatalogoDialogProps) {
  const [busca, setBusca] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [boms, setBoms] = useState<Bom[]>([])
  const [bomItemsCache, setBomItemsCache] = useState<Record<string, any[]>>({})
  const [pMap, setPMap] = useState<Record<string, number>>({})
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!open) {
      setBusca('')
      setQuantidades({})
      return
    }

    const load = async () => {
      try {
        const [bomsRes, itensRes, paramsRes] = await Promise.allSettled([
          bomsService.getAll(),
          bomsService.getAllItemsGrouped(),
          parametrosService.getMap(),
        ])
        if (bomsRes.status === 'fulfilled') setBoms(bomsRes.value)
        if (itensRes.status === 'fulfilled') setBomItemsCache(itensRes.value)
        if (paramsRes.status === 'fulfilled') setPMap(paramsRes.value)
      } catch (err) {
        console.error('Erro ao carregar catálogo para adicionar itens:', err)
        toast.error('Erro ao carregar catálogo de produtos.')
      }
    }
    load()
  }, [open])

  const precoDeBom = (bom: Bom): number => {
    if (
      bom.preco_final_tabela !== undefined &&
      bom.preco_final_tabela !== null &&
      Number(bom.preco_final_tabela) > 0
    ) {
      return Number(bom.preco_final_tabela)
    }
    const items = bomItemsCache[bom.id] || []
    const custo = calcularCustoConsolidado(items as any)
    const percentuais = montarPercentuais(pMap, {
      overhead: bom.overhead_percentual,
      margem: bom.margem_percentual,
    })
    return calcularMarkupDivisor(custo, percentuais).precoVenda
  }

  const custoDeBom = (bom: Bom): number => {
    const items = bomItemsCache[bom.id] || []
    return calcularCustoConsolidado(items as any)
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return boms
      .filter((b) => !q || b.sku.toLowerCase().includes(q) || b.nome.toLowerCase().includes(q))
      .slice(0, 50)
  }, [boms, busca])

  const totalSelecao = Object.entries(quantidades).reduce((acc, [bomId, qtd]) => {
    const bom = boms.find((b) => b.id === bomId)
    if (!bom || !qtd) return acc
    return acc + precoDeBom(bom) * qtd
  }, 0)

  const temSelecao = Object.values(quantidades).some((q) => q > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const selecionados = Object.entries(quantidades).filter(([, qtd]) => qtd > 0)
    if (selecionados.length === 0) {
      toast.error('Informe a quantidade de pelo menos um produto.')
      return
    }

    setIsSubmitting(true)
    try {
      for (const [bomId, qtd] of selecionados) {
        const bom = boms.find((b) => b.id === bomId)
        if (!bom) continue
        await propostasService.addItem(propostaId, {
          bom_id: bom.id,
          sku: bom.sku,
          nome_produto: bom.nome,
          quantidade: qtd,
          preco_unitario: precoDeBom(bom),
          custo_unitario: custoDeBom(bom),
          unidade: bom.unidade || 'UN',
        })
      }
      toast.success(
        selecionados.length === 1
          ? 'Produto adicionado à proposta!'
          : `${selecionados.length} produtos adicionados à proposta!`,
      )
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao adicionar produtos à proposta.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <DialogTitle>Adicionar Produtos do Catálogo</DialogTitle>
          </div>
          <DialogDescription>
            Selecione SKUs do catálogo (BOMs) e informe a quantidade. O preço unitário usa o preço
            de venda atual da precificação — igual à criação de proposta.
            {skusExistentes.length > 0 && (
              <span className="block mt-1 text-xs">
                Já estão na proposta:{' '}
                <span className="font-medium">{skusExistentes.join(', ')}</span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por SKU ou nome do produto..."
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="border border-border rounded-lg divide-y divide-border max-h-72 overflow-y-auto">
            {filtrados.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">
                Nenhum produto encontrado no catálogo.
              </p>
            ) : (
              filtrados.map((bom) => {
                const qtd = quantidades[bom.id] || 0
                const jaNaProposta = skusExistentes.includes(bom.sku)
                return (
                  <div
                    key={bom.id}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-primary truncate">
                          {bom.sku}
                        </span>
                        {jaNaProposta && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 font-normal gap-0.5 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-300"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            já na proposta
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-foreground block truncate">{bom.nome}</span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {formatBRL(precoDeBom(bom))}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={qtd || ''}
                      placeholder="Qtd"
                      onChange={(e) =>
                        setQuantidades((prev) => ({
                          ...prev,
                          [bom.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="w-20 h-8 text-center font-mono text-xs shrink-0"
                    />
                  </div>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border">
            <span className="text-sm font-semibold text-foreground">Valor dos novos itens:</span>
            <span className="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {formatBRL(totalSelecao)}
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
            <Button type="submit" disabled={isSubmitting || !temSelecao} className="gap-2">
              <PlusCircle className="h-4 w-4" />
              {isSubmitting ? 'Adicionando...' : 'Adicionar à Proposta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
