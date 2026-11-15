import { useCallback, useEffect, useState } from 'react'
import { propostasService } from '@/services/propostas'
import { bomsService } from '@/services/boms'
import type { Proposta, PropostaItem, Bom } from '@/types/erp'
import { formatBRL } from '@/utils/formatters'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Package, Search, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import NcmCell from '@/components/precos/NcmCell'
import CestCell from '@/components/precos/CestCell'
import ClassificarNcmLoteButton from '@/components/precos/ClassificarNcmLoteButton'
import EditarProdutoCatalogoDialog from '@/components/precos/EditarProdutoCatalogoDialog'

const statusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  em_negociacao: 'Em Negociação',
  vendida: 'Vendida',
  perdida: 'Perdida',
}

const statusColors: Record<string, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  enviada: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  em_negociacao: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  vendida: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  perdida: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

export interface CatalogoProdutoItem {
  sku: string
  nome_produto: string
  preco_unitario: number
  preco_direto: boolean
  unidade?: string
  proposta_id?: string
  origem?: string
  created?: string
  /** Registro do BOM de origem, quando o produto veio de um cadastro (para NCM). */
  bom?: Bom
}

/**
 * Catálogo de produtos finais do vendedor — mostra APENAS o preço de venda.
 * Nunca exibe custo, margem, parâmetros nem link para o BOM/estrutura.
 * Exibe marcação "Preço Direto" para produtos avulsos cadastrados sem BOM.
 */
export default function CatalogoPage() {
  const { perfil } = useAuth()
  const podeAdmin = perfil === 'admin'
  const [catalogoItens, setCatalogoItens] = useState<CatalogoProdutoItem[]>([])
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [bomsCadastrados, setBomsCadastrados] = useState<Bom[]>([])

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      // Carrega propostas e seus itens
      const props = await propostasService.getAll()
      setPropostas(props)
      // UMA listagem única de todos os itens de propostas (evita rajada 429)
      const propostaItens = await propostasService.getAllItemsGroupedFlat()

      // Carrega produtos cadastrados (BOMs e Preço Direto)
      let produtosCadastrados: Bom[] = []
      try {
        produtosCadastrados = await bomsService.getAll()
      } catch (errBoms) {
        console.warn('Aviso ao carregar boms no catálogo:', errBoms)
      }
      setBomsCadastrados(produtosCadastrados)

      // Mapeamento por SKU para consolidar o catálogo
      const mapPorSku = new Map<string, CatalogoProdutoItem>()

      // 1. Insere produtos cadastrados em boms que tenham preco_final_tabela, preco_venda ou preco_direto
      for (const p of produtosCadastrados) {
        const precoCatalogo =
          p.preco_final_tabela !== undefined &&
          p.preco_final_tabela !== null &&
          Number(p.preco_final_tabela) > 0
            ? Number(p.preco_final_tabela)
            : p.preco_venda || 0

        mapPorSku.set(p.sku.trim().toUpperCase(), {
          sku: p.sku,
          nome_produto: p.nome,
          preco_unitario: precoCatalogo,
          preco_direto: Boolean(p.preco_direto),
          unidade: p.unidade || 'UN',
          origem: p.preco_direto ? 'Cadastro Avulso' : 'Tabela / BOM',
          created: p.created,
          bom: p,
        })
      }

      // 2. Sobrepõe ou complementa com histórico de itens de propostas (último preço registrado)
      for (const it of propostaItens) {
        const skuKey = it.sku.trim().toUpperCase()
        const existing = mapPorSku.get(skuKey)

        // Se já existe e o item da proposta tem preço direto ou é mais recente, atualiza
        const ehPrecoDireto = Boolean(it.preco_direto || existing?.preco_direto)

        if (!existing) {
          mapPorSku.set(skuKey, {
            sku: it.sku,
            nome_produto: it.nome_produto || '',
            preco_unitario: it.preco_unitario,
            preco_direto: ehPrecoDireto,
            unidade: it.unidade || 'UN',
            proposta_id: it.proposta_id,
            created: it.created,
          })
        } else {
          // Se o item da proposta for mais recente ou se o cadastro original não tinha preço de venda
          if ((it.created ?? '') >= (existing.created ?? '') || existing.preco_unitario === 0) {
            mapPorSku.set(skuKey, {
              ...existing,
              preco_unitario: it.preco_unitario,
              nome_produto: it.nome_produto || existing.nome_produto,
              preco_direto: ehPrecoDireto,
              proposta_id: it.proposta_id,
              created: it.created || existing.created,
            })
          }
        }
      }

      setCatalogoItens(Array.from(mapPorSku.values()))
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar catálogo.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtrados = catalogoItens.filter((it) => {
    if (!searchTerm.trim()) return true
    const q = searchTerm.toLowerCase()
    const prop = propostas.find((p) => p.id === it.proposta_id)
    return (
      it.sku.toLowerCase().includes(q) ||
      (it.nome_produto || '').toLowerCase().includes(q) ||
      (prop?.cliente || '').toLowerCase().includes(q) ||
      (it.preco_direto && 'preço direto preco direto avulso'.includes(q))
    )
  })

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Catálogo de Produtos
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Produtos finais disponíveis com preço de venda — use nas suas propostas
          </p>
        </div>
        <ClassificarNcmLoteButton boms={bomsCadastrados} onConcluido={load} podeAdmin={podeAdmin} />
      </div>

      {/* Busca */}
      <div className="relative md:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por SKU, produto ou preço direto..."
          className="pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Carregando catálogo...</div>
      ) : filtrados.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <Package className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="font-semibold text-foreground text-lg">Nenhum produto no catálogo</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Os produtos aparecem aqui assim que houver produtos cadastrados ou propostas com
              preços registrados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="font-semibold">SKU</TableHead>
                <TableHead className="font-semibold">Produto</TableHead>
                <TableHead className="font-semibold">Tipo</TableHead>
                <TableHead className="text-right font-semibold">Preço de Venda</TableHead>
                <TableHead className="font-semibold">NCM</TableHead>
                <TableHead className="font-semibold">CEST</TableHead>
                <TableHead className="text-center font-semibold">Usado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((it) => {
                const prop = propostas.find((p) => p.id === it.proposta_id)
                return (
                  <TableRow key={it.sku} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-bold text-primary">
                      {it.sku}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>{it.nome_produto || '—'}</span>
                        {it.unidade && it.unidade !== 'UN' && (
                          <span className="text-xs text-muted-foreground">({it.unidade})</span>
                        )}
                        {it.bom && (
                          <EditarProdutoCatalogoDialog
                            bom={it.bom}
                            podeAdmin={podeAdmin}
                            onChanged={load}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {it.preco_direto ? (
                        <Badge
                          variant="secondary"
                          className="text-xs gap-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                        >
                          <Tag className="h-3 w-3" />
                          Preço Direto
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Com BOM
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatBRL(it.preco_unitario)}
                    </TableCell>
                    <TableCell>
                      {it.bom ? (
                        <NcmCell bom={it.bom} podeAdmin={podeAdmin} onChanged={load} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {it.bom ? (
                        <CestCell bom={it.bom} podeAdmin={podeAdmin} onChanged={load} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {prop ? (
                        <Badge className={`${statusColors[prop.status] || ''} text-xs`}>
                          {statusLabels[prop.status] || prop.status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Catálogo</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
