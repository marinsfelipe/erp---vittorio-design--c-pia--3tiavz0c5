import React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Cliente, UsuarioPerfil } from '@/types/erp'
import { Filter, Search, X, Calendar } from 'lucide-react'

interface PipelineFiltersBarProps {
  isAdmin: boolean
  currentUserName?: string
  listaVendedores: UsuarioPerfil[]
  clientes: Cliente[]
  filtroVendedor: string
  filtroCliente: string
  filtroPeriodo: string
  dataInicio: string
  dataFim: string
  termoBusca: string
  hasFiltrosAtivos: boolean
  onSetFiltroVendedor: (val: string) => void
  onSetFiltroCliente: (val: string) => void
  onSetFiltroPeriodo: (val: string) => void
  onSetDataInicio: (val: string) => void
  onSetDataFim: (val: string) => void
  onSetTermoBusca: (val: string) => void
  onLimparFiltros: () => void
}

export const PipelineFiltersBar: React.FC<PipelineFiltersBarProps> = ({
  isAdmin,
  currentUserName,
  listaVendedores,
  clientes,
  filtroVendedor,
  filtroCliente,
  filtroPeriodo,
  dataInicio,
  dataFim,
  termoBusca,
  hasFiltrosAtivos,
  onSetFiltroVendedor,
  onSetFiltroCliente,
  onSetFiltroPeriodo,
  onSetDataInicio,
  onSetDataFim,
  onSetTermoBusca,
  onLimparFiltros,
}) => {
  return (
    <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Filter className="h-4 w-4 text-primary" />
          <span>Filtros do Funil</span>
          {hasFiltrosAtivos && (
            <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
              Ativos
            </Badge>
          )}
        </div>
        {hasFiltrosAtivos && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onLimparFiltros}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <X className="h-3 w-3" />
            Limpar Filtros
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Busca Textual */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Buscar proposta ou cliente</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Nº ou nome..."
              value={termoBusca}
              onChange={(e) => onSetTermoBusca(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        {/* Filtro Vendedor (admin vê seletor; vendedor vê desabilitado/fixo) */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Vendedor</Label>
          {isAdmin ? (
            <Select value={filtroVendedor} onValueChange={onSetFiltroVendedor}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Todos os vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {listaVendedores.map((v) => (
                  <SelectItem key={v.id || v.user} value={v.user || v.id}>
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={currentUserName || 'Minhas propostas'}
              disabled
              className="h-8 text-xs bg-muted/50 cursor-not-allowed"
            />
          )}
        </div>

        {/* Filtro Cliente */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Cliente</Label>
          <Select value={filtroCliente} onValueChange={onSetFiltroCliente}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os clientes</SelectItem>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.razao_social}>
                  {c.razao_social}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filtro Período */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Período de Criação</Label>
          <Select value={filtroPeriodo} onValueChange={onSetFiltroPeriodo}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todo o histórico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todo o histórico</SelectItem>
              <SelectItem value="mes_atual">Mês Atual</SelectItem>
              <SelectItem value="ultimos_30">Últimos 30 dias</SelectItem>
              <SelectItem value="ultimos_90">Últimos 90 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Inputs de Período Personalizado */}
      {filtroPeriodo === 'custom' && (
        <div className="flex items-center gap-3 pt-2 border-t border-border/60">
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">De:</span>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => onSetDataInicio(e.target.value)}
              className="h-8 text-xs w-36"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Até:</span>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => onSetDataFim(e.target.value)}
              className="h-8 text-xs w-36"
            />
          </div>
        </div>
      )}
    </div>
  )
}
