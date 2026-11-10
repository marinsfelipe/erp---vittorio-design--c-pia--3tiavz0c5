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
import type { PropostaDescontoAuditoria } from '@/types/erp'
import { formatBRL, formatDateTime, formatPercent } from '@/utils/formatters'
import { ShieldCheck, History, Tag, Sparkles, User, Calendar } from 'lucide-react'

interface HistoricoAuditoriaDescontosProps {
  registros: PropostaDescontoAuditoria[]
  isLoading?: boolean
}

export function HistoricoAuditoriaDescontos({
  registros,
  isLoading = false,
}: HistoricoAuditoriaDescontosProps) {
  return (
    <Card className="border-border bg-card shadow-xs">
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <span>Histórico de Auditoria de Descontos</span>
                <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                  Admin
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Registro de quem aplicou cada desconto, data/hora, valor e justificativa
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs font-mono">
            {registros.length} {registros.length === 1 ? 'registro' : 'registros'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Carregando histórico de auditoria...
          </p>
        ) : registros.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs space-y-1">
            <History className="h-6 w-6 mx-auto stroke-1 text-muted-foreground" />
            <p>Nenhuma alteração de desconto registrada nesta proposta.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 text-xs">
                <TableHead className="font-semibold">Data / Hora</TableHead>
                <TableHead className="font-semibold">Usuário</TableHead>
                <TableHead className="font-semibold">Alvo</TableHead>
                <TableHead className="font-semibold">Desconto Aplicado</TableHead>
                <TableHead className="text-right font-semibold">Abatimento</TableHead>
                <TableHead className="font-semibold">Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.map((reg) => {
                const isGeral = reg.tipo_alvo === 'geral'
                const nomeUsuario =
                  reg.usuario_nome ||
                  reg.expand?.usuario?.name ||
                  reg.expand?.usuario?.email ||
                  'Usuário'

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
                      {isGeral ? (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[11px] font-normal border-primary/30 text-primary"
                        >
                          <Sparkles className="h-3 w-3" />
                          Geral (Proposta)
                        </Badge>
                      ) : (
                        <div className="space-y-0.5">
                          <Badge
                            variant="secondary"
                            className="gap-1 text-[11px] font-mono font-normal"
                          >
                            <Tag className="h-2.5 w-2.5" />
                            {reg.item_sku || 'Item'}
                          </Badge>
                          {reg.item_nome && (
                            <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                              {reg.item_nome}
                            </p>
                          )}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="font-mono">
                      {reg.desconto_tipo === 'percentual' ? (
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          {formatPercent(reg.desconto_valor_informado)}
                        </span>
                      ) : (
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          {formatBRL(reg.desconto_valor_informado)}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                      {reg.desconto_valor_total > 0
                        ? `- ${formatBRL(reg.desconto_valor_total)}`
                        : 'R$ 0,00'}
                    </TableCell>

                    <TableCell className="text-[11px] text-muted-foreground max-w-xs">
                      {reg.observacao || '—'}
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
