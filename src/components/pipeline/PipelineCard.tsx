import React from 'react'
import { Link } from 'react-router-dom'
import type { Proposta } from '@/types/erp'
import { formatBRL } from '@/utils/formatters'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  GripVertical,
  MoreVertical,
  Eye,
  AlertCircle,
  User,
  Calendar,
  DollarSign,
  ArrowRight,
} from 'lucide-react'

interface PipelineCardProps {
  proposta: Proposta
  isVendedor: boolean
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void
  onMoveToStatus: (proposta: Proposta, status: string) => void
}

export const PipelineCard: React.FC<PipelineCardProps> = ({
  proposta,
  isVendedor,
  onDragStart,
  onMoveToStatus,
}) => {
  const criadorNome = proposta.expand?.criador?.name || proposta.expand?.criador?.email || 'Sistema'
  const dataCriacao = proposta.created
    ? new Date(proposta.created).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
    : '—'

  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart(e, proposta.id)}
      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-all border border-border/80 bg-card group"
    >
      <CardContent className="p-3.5 space-y-2.5">
        {/* Cabeçalho do Card */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 group-hover:text-muted-foreground" />
            <span className="font-mono text-xs font-bold text-primary truncate">
              {proposta.numero || 'Sem número'}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-muted-foreground">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs">
                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link to={`/propostas/${proposta.id}`} className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5" /> Ver Detalhes
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">
                  Mover para...
                </DropdownMenuLabel>
                {proposta.status !== 'rascunho' && (
                  <DropdownMenuItem
                    onClick={() => onMoveToStatus(proposta, 'rascunho')}
                    className="cursor-pointer gap-2"
                  >
                    <ArrowRight className="h-3 w-3" /> Rascunho
                  </DropdownMenuItem>
                )}
                {proposta.status !== 'enviada' && (
                  <DropdownMenuItem
                    onClick={() => onMoveToStatus(proposta, 'enviada')}
                    className="cursor-pointer gap-2"
                  >
                    <ArrowRight className="h-3 w-3" /> Enviada
                  </DropdownMenuItem>
                )}
                {proposta.status !== 'em_negociacao' && (
                  <DropdownMenuItem
                    onClick={() => onMoveToStatus(proposta, 'em_negociacao')}
                    className="cursor-pointer gap-2"
                  >
                    <ArrowRight className="h-3 w-3" /> Em negociação
                  </DropdownMenuItem>
                )}
                {proposta.status !== 'vendida' && (
                  <DropdownMenuItem
                    onClick={() => onMoveToStatus(proposta, 'vendida')}
                    className="cursor-pointer gap-2 text-emerald-700 dark:text-emerald-400 font-medium"
                  >
                    <ArrowRight className="h-3 w-3" /> Vendida
                  </DropdownMenuItem>
                )}
                {proposta.status !== 'perdida' && (
                  <DropdownMenuItem
                    onClick={() => onMoveToStatus(proposta, 'perdida')}
                    className="cursor-pointer gap-2 text-rose-700 dark:text-rose-400 font-medium"
                  >
                    <ArrowRight className="h-3 w-3" /> Perdida
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Cliente */}
        <div>
          <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {proposta.cliente || 'Cliente não identificado'}
          </h4>
        </div>

        {/* Valor Total */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <span>Valor</span>
          </div>
          <span className="font-mono text-sm font-bold text-foreground">
            {formatBRL(proposta.valor_total || 0)}
          </span>
        </div>

        {/* Motivo da Perda (se houver) */}
        {proposta.status === 'perdida' && (
          <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 space-y-1">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-800 dark:text-rose-300">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>Motivo da Perda:</span>
            </div>
            <p className="text-[11px] text-rose-900/90 dark:text-rose-200 line-clamp-2 italic">
              {proposta.motivo_perda || 'Não informado'}
            </p>
          </div>
        )}

        {/* Rodapé: Vendedor e Data */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
          {!isVendedor && (
            <span
              className="flex items-center gap-1 truncate max-w-[130px]"
              title={`Vendedor: ${criadorNome}`}
            >
              <User className="h-3 w-3 shrink-0 text-muted-foreground/80" />
              <span className="truncate">{criadorNome}</span>
            </span>
          )}
          <span className="flex items-center gap-1 ml-auto">
            <Calendar className="h-3 w-3 shrink-0 text-muted-foreground/80" />
            <span>{dataCriacao}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
