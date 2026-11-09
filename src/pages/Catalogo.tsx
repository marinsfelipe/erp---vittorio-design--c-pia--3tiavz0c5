import { useEffect, useState } from 'react'
import { propostasService } from '@/services/propostas'
import type { Proposta, PropostaItem } from '@/types/erp'
import { formatBRL } from '@/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Package, Search } from 'lucide-react'
import { toast } from 'sonner'

const statusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  vendida: 'Vendida',
}

const statusColors: Record<string, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  enviada: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  vendida: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

/**
 * Catálogo de produtos finais do vendedor — mostra APENAS o preço de venda.
 * Nunca exibe custo, margem, parâmetros nem link para o BOM/estrutura.
 */
export default function CatalogoPage() {
  const [itens, setItens] = useState<PropostaItem[]>([])
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const props = await propostasService.getAll()
        setPropostas(props)
        const lists = await Promise.all(props.map((p) => propostasService.getItems(p.id)))
        setItens(lists.flat())
      } catch (err: any) {
        console.error(err)
        toast.error('Erro ao carregar catálogo.')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  // Último preço de venda registrado por SKU (snapshot das propostas)
  const porSku = new Map<string, PropostaItem>()
  for (const it of itens) {
    const prev = porSku.get(it.sku)
    if (!prev || (it.created ?? '') > (prev.created ?? '')) porSku.set(it.sku, it)
  }
  const catalogo = Array.from(porSku.values())

  const filtrados = catalogo.filter((it) => {
    if (!searchTerm.trim()) return true
    const q = searchTerm.toLowerCase()
    return (
      it.sku.toLowerCase().includes(q) ||
      (it.nome_produto || '').toLowerCase().includes(q) ||
      (propostas.find((p) => p.id === it.proposta_id)?.cliente || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="border-b border-border pb-5">
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

      {/* Busca */}
      <div className="relative md:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por SKU ou produto..."
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
              Os produtos aparecem aqui assim que houver propostas com preços registrados.
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
                <TableHead className="text-right font-semibold">Preço de Venda</TableHead>
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
                      {it.nome_produto || '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatBRL(it.preco_unitario)}
                    </TableCell>
                    <TableCell className="text-center">
                      {prop ? (
                        <Badge className={`${statusColors[prop.status] || ''} text-xs`}>
                          {statusLabels[prop.status] || prop.status}
                        </Badge>
                      ) : (
                        '—'
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
