import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PropostaPrecoAuditoria } from '@/types/erp'
import { formatBRL, formatDateTime } from '@/utils/formatters'
import { History, Pencil, User, Calendar, ArrowRight } from 'lucide-react'

interface HistoricoAuditoriaPrecosProps {
  registros: PropostaPrecoAuditoria[]
  isLoading?: boolean
}

export function HistoricoAuditoriaPrecos({
  registros,
  isLoading = false,
}: HistoricoAuditoriaPrecosProps) {
  return (
    <Card className="border-border bg-card shadow-xs">
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <span>Histórico de Edições de Preços</span>
                <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                  Auditoria
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Registro de preços originais da tabela, alterações de valor unitário, usuário e
                data/hora
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs font-mono">
            {registros.length} {registros.length === 1 ? 'edição' : 'edições'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Carregando histórico de edições de preços...
          </p>
        ) : registros.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs space-y-1">
            <History className="h-6 w-6 mx-auto stroke-1 text-muted-foreground" />
            <p>Nenhuma edição direta de preço unitário registrada nesta proposta.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 text-xs">
                <TableHead className="font-semibold">Data / Hora</TableHead>
                <TableHead className="font-semibold">Usuário</TableHead>
                <TableHead className="font-semibold">Item</TableHead>
                <TableHead className="text-right font-semibold">Tabela Original</TableHead>
                <TableHead className="text-center font-semibold">Alteração</TableHead>
                <TableHead className="font-semibold">Justificativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.map((reg) => {
                const nomeUsuario =
                  reg.usuario_nome ||
                  reg.expand?.usuario?.name ||
                  reg.expand?.usuario?.email ||
                  'Usuário'

                const precoOrig =
                  reg.preco_original_tabela !== undefined && reg.preco_original_tabela !== null
                    ? reg.preco_original_tabela
                    : reg.preco_anterior

                const variacao = reg.preco_novo - reg.preco_anterior

                return (
                  <TableRow key={reg.id} className="text-xs hover:bg-muted/30">
                    <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>{reg.created ? formatDateTime(reg.created) : '—'}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{nomeUsuario}</span>
                      </div>
                      {reg.usuario_email && (
                        <span className="text-[10px] text-muted-foreground block">
                          {reg.usuario_email}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="space-y-0.5">
                        <Badge
                          variant="secondary"
                          className="gap-1 text-[11px] font-mono font-normal"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                          {reg.item_sku || 'Item'}
                        </Badge>
                        {reg.item_nome && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {reg.item_nome}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatBRL(precoOrig)}
                    </TableCell>

                    <TableCell className="text-center font-mono">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/40">
                        <span className="line-through text-muted-foreground">
                          {formatBRL(reg.preco_anterior)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-bold text-foreground">
                          {formatBRL(reg.preco_novo)}
                        </span>
                      </div>
                      {variacao !== 0 && (
                        <div
                          className={`text-[10px] ${
                            variacao > 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {variacao > 0 ? '+' : ''}
                          {formatBRL(variacao)}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-[11px] text-muted-foreground max-w-xs">
                      {reg.justificativa || 'Edição direta de preço na linha'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
