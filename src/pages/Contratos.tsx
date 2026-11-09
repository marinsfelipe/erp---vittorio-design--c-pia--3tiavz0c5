import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { contratosService } from '@/services/contratos'
import type { Contrato } from '@/types/erp'
import { formatBRL, formatDateTime } from '@/utils/formatters'
import { imprimirContrato } from '@/utils/contratoPdf'
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { FileText, Printer, Search, Eye, Building2, Trash2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'

export default function ContratosPage() {
  const { isAdmin } = useAuth()
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [visualizandoContrato, setVisualizandoContrato] = useState<Contrato | null>(null)

  const load = async () => {
    setIsLoading(true)
    try {
      const data = await contratosService.getAll()
      setContratos(data)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar histórico de contratos.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este contrato do histórico?')) return
    setIsDeleting(id)
    try {
      await contratosService.delete(id)
      toast.success('Contrato excluído do histórico.')
      load()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir contrato.')
    } finally {
      setIsDeleting(null)
    }
  }

  const handleImprimir = (c: Contrato) => {
    imprimirContrato({
      numero: c.numero,
      cliente: c.cliente_nome,
      cnpj: c.cliente_cnpj,
      conteudo: c.conteudo,
      dataGeracao: c.created ? formatDateTime(c.created) : undefined,
    })
  }

  const filtered = contratos.filter((c) => {
    const q = searchTerm.toLowerCase()
    return (
      c.numero.toLowerCase().includes(q) ||
      c.cliente_nome.toLowerCase().includes(q) ||
      (c.cliente_cnpj || '').toLowerCase().includes(q) ||
      (c.proposta_numero || '').toLowerCase().includes(q) ||
      (c.modelo_titulo || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Histórico de Contratos
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              {contratos.length} contrato(s)
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Contratos comerciais gerados a partir de propostas vendidas, com numeração e emissão de
            PDF
          </p>
        </div>
      </div>

      {/* Busca */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, cliente, CNPJ ou proposta..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Tabela de contratos */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Carregando histórico de contratos...
            </p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto stroke-1" />
              <p className="text-sm font-medium text-foreground">Nenhum contrato gerado ainda.</p>
              <p className="text-xs text-muted-foreground">
                Acesse uma Proposta Comercial com status "Vendida" para gerar seu primeiro contrato.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="font-semibold">Nº Contrato</TableHead>
                  <TableHead className="font-semibold">Cliente</TableHead>
                  <TableHead className="font-semibold">Proposta</TableHead>
                  <TableHead className="font-semibold">Modelo Utilizado</TableHead>
                  <TableHead className="text-right font-semibold">Valor</TableHead>
                  <TableHead className="font-semibold">Data</TableHead>
                  <TableHead className="text-right font-semibold">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono font-bold text-xs text-primary">
                      {c.numero}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{c.cliente_nome}</span>
                        </div>
                        {c.cliente_cnpj && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            CNPJ: {c.cliente_cnpj}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {c.proposta ? (
                        <Link
                          to={`/propostas/${c.proposta}`}
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <span>{c.proposta_numero || 'Ver Proposta'}</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span>{c.proposta_numero || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {c.modelo_titulo || 'Modelo Padrão'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-xs text-emerald-700 dark:text-emerald-400">
                      {c.valor_total ? formatBRL(c.valor_total) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.created ? formatDateTime(c.created) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setVisualizandoContrato(c)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Visualizar texto do contrato"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleImprimir(c)}
                          className="h-8 text-xs gap-1.5"
                          title="Gerar PDF / Imprimir"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">PDF</span>
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(c.id)}
                            disabled={isDeleting === c.id}
                            className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Excluir do histórico"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal de visualização do contrato gerado */}
      <Dialog
        open={Boolean(visualizandoContrato)}
        onOpenChange={(open) => !open && setVisualizandoContrato(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span>Contrato {visualizandoContrato?.numero}</span>
            </DialogTitle>
            <DialogDescription>
              Cliente: {visualizandoContrato?.cliente_nome} — Proposta:{' '}
              {visualizandoContrato?.proposta_numero || '—'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 rounded-lg bg-muted/20 border border-border font-serif text-xs leading-relaxed whitespace-pre-wrap">
            {visualizandoContrato?.conteudo}
          </div>

          <DialogFooter className="pt-2 flex items-center justify-between">
            <Button type="button" variant="outline" onClick={() => setVisualizandoContrato(null)}>
              Fechar
            </Button>
            {visualizandoContrato && (
              <Button
                type="button"
                onClick={() => handleImprimir(visualizandoContrato)}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                Imprimir / Salvar em PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
