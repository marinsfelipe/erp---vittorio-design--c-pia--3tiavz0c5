import React, { useEffect, useState } from 'react'
import { bomsService } from '@/services/boms'
import type { Bom, BomItem } from '@/types/erp'
import { montarArvore, flattenTree } from '@/utils/bomTree'
import { formatBRL, formatNumber } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  ShoppingCart,
  Building,
  Printer,
  Download,
  Filter,
  RefreshCw,
  PackageCheck,
  Search,
  CheckSquare,
  Square,
} from 'lucide-react'
import { toast } from 'sonner'

interface ConsolidatedItem {
  codigo: string
  descricao: string
  categoria: string
  unidade: string
  fornecedor: string
  quantidadeTotal: number
  custoUnitario: number
  custoTotal: number
  origemSkus: string[]
}

interface FornecedorGroup {
  fornecedor: string
  itens: ConsolidatedItem[]
  totalFornecedor: number
  totalItens: number
}

export default function ListaComprasPage() {
  const [boms, setBoms] = useState<Bom[]>([])
  const [bomsItemsMap, setBomsItemsMap] = useState<Record<string, BomItem[]>>({})
  const [selectedBoms, setSelectedBoms] = useState<Record<string, boolean>>({})
  const [bomMultipliers, setBomMultipliers] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFornecedorFilter, setSelectedFornecedorFilter] = useState<string>('todos')

  const loadData = async () => {
    setIsLoading(true)
    try {
      const allBoms = await bomsService.getAll()
      setBoms(allBoms)

      // Carregar itens de cada BOM
      const itemsMap: Record<string, BomItem[]> = {}
      const initialSelected: Record<string, boolean> = {}
      const initialMultipliers: Record<string, number> = {}

      await Promise.all(
        allBoms.map(async (bom) => {
          try {
            const its = await bomsService.getItems(bom.id)
            itemsMap[bom.id] = its
          } catch {
            itemsMap[bom.id] = []
          }
          // Por padrão selecionar todos os BOMs com 1 unidade a fabricar
          initialSelected[bom.id] = true
          initialMultipliers[bom.id] = 1
        }),
      )

      setBomsItemsMap(itemsMap)
      setSelectedBoms(initialSelected)
      setBomMultipliers(initialMultipliers)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar dados dos BOMs para lista de compras.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleToggleSelectAll = (select: boolean) => {
    const updated: Record<string, boolean> = {}
    boms.forEach((b) => {
      updated[b.id] = select
    })
    setSelectedBoms(updated)
  }

  // Consolidar itens por fornecedor
  const consolidatedMap: Record<string, Record<string, ConsolidatedItem>> = {}

  boms.forEach((bom) => {
    if (!selectedBoms[bom.id]) return
    const multiplier = bomMultipliers[bom.id] || 1
    const items = bomsItemsMap[bom.id] || []

    // Na árvore multi-nível, só itens de terceiros (comprados) entram na lista de compras
    const itensComprados = flattenTree(montarArvore(bom, items).root)
      .filter((n) => n.item.item_tipo === 'componente_terceiros')
      .map((n) => n.item)

    itensComprados.forEach((it) => {
      const fornecedor = it.fornecedor?.trim() || 'Fornecedor Não Definido'
      const codigo = it.codigo?.trim() || 'SEM-COD'

      if (!consolidatedMap[fornecedor]) {
        consolidatedMap[fornecedor] = {}
      }

      const existing = consolidatedMap[fornecedor][codigo]
      const qtdAdd = (Number(it.quantidade) || 0) * multiplier
      const custoUnit = Number(it.custo_unitario) || 0

      if (existing) {
        existing.quantidadeTotal += qtdAdd
        existing.custoTotal = existing.quantidadeTotal * existing.custoUnitario
        if (!existing.origemSkus.includes(bom.sku)) {
          existing.origemSkus.push(bom.sku)
        }
      } else {
        consolidatedMap[fornecedor][codigo] = {
          codigo: it.codigo,
          descricao: it.descricao,
          categoria: it.categoria || 'Geral',
          unidade: it.unidade || 'UN',
          fornecedor,
          quantidadeTotal: qtdAdd,
          custoUnitario: custoUnit,
          custoTotal: qtdAdd * custoUnit,
          origemSkus: [bom.sku],
        }
      }
    })
  })

  // Agrupar e ordenar
  const fornecedores: FornecedorGroup[] = Object.entries(consolidatedMap)
    .map(([fornecedor, itensObj]) => {
      let itens = Object.values(itensObj)
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        itens = itens.filter(
          (i) =>
            i.codigo.toLowerCase().includes(q) ||
            i.descricao.toLowerCase().includes(q) ||
            i.fornecedor.toLowerCase().includes(q),
        )
      }
      const totalFornecedor = itens.reduce((acc, i) => acc + i.custoTotal, 0)
      return {
        fornecedor,
        itens,
        totalFornecedor,
        totalItens: itens.length,
      }
    })
    .filter((g) => g.itens.length > 0)
    .sort((a, b) => b.totalFornecedor - a.totalFornecedor)

  const grandTotal = fornecedores.reduce((acc, g) => acc + g.totalFornecedor, 0)
  const totalComponentesUnicos = fornecedores.reduce((acc, g) => acc + g.totalItens, 0)

  // Exportar lista consolidada para CSV
  const handleExportCsv = () => {
    let csv =
      'Fornecedor;Codigo;Descricao;Unidade;Quantidade_Total;Custo_Unitario;Custo_Total;SKUs_Demanda\n'
    fornecedores.forEach((g) => {
      g.itens.forEach((i) => {
        csv += `"${i.fornecedor}";"${i.codigo}";"${i.descricao}";"${i.unidade}";${i.quantidadeTotal.toFixed(2)};${i.custoUnitario.toFixed(2)};${i.custoTotal.toFixed(2)};"${i.origemSkus.join(', ')}"\n`
      })
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `lista_compras_consolidada_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Lista de compras exportada com sucesso!')
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Lista Consolidada de Compras
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Componentes e insumos agrupados por fornecedor com quantidades totais somadas dos BOMs
            selecionados
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir Pedidos
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Seleção de BOMs e Quantidades de Fabricação */}
      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" />
              Equipamentos / BOMs no Plano de Produção
            </CardTitle>
            <div className="flex gap-2 text-xs">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleSelectAll(true)}
                className="h-7 px-2"
              >
                Selecionar Todos
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleSelectAll(false)}
                className="h-7 px-2"
              >
                Limpar Seleção
              </Button>
            </div>
          </div>
          <CardDescription className="text-xs">
            Marque os SKUs e ajuste as quantidades planejadas para multiplicar a demanda de
            componentes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando BOMs disponíveis...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {boms.map((bom) => {
                const isChecked = !!selectedBoms[bom.id]
                return (
                  <div
                    key={bom.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                      isChecked
                        ? 'bg-primary/5 border-primary/40 shadow-xs'
                        : 'bg-muted/20 border-border opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <Checkbox
                        id={`check-${bom.id}`}
                        checked={isChecked}
                        onCheckedChange={(val) =>
                          setSelectedBoms((prev) => ({ ...prev, [bom.id]: !!val }))
                        }
                      />
                      <label htmlFor={`check-${bom.id}`} className="cursor-pointer min-w-0">
                        <span className="font-mono text-xs font-bold text-primary block truncate">
                          {bom.sku}
                        </span>
                        <span className="text-xs text-foreground font-medium block truncate">
                          {bom.nome}
                        </span>
                      </label>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Label
                        htmlFor={`qty-${bom.id}`}
                        className="text-[11px] text-muted-foreground"
                      >
                        Qtd:
                      </Label>
                      <Input
                        id={`qty-${bom.id}`}
                        type="number"
                        min="1"
                        value={bomMultipliers[bom.id] || 1}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 1)
                          setBomMultipliers((prev) => ({ ...prev, [bom.id]: val }))
                        }}
                        className="h-7 w-14 text-center font-mono text-xs p-1"
                        disabled={!isChecked}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barra de Filtro e Totais */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl shadow-sm print:hidden">
        <div className="relative flex-1 w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por código, descrição ou fornecedor..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-6 w-full md:w-auto justify-between">
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Fornecedores Impactados:</span>
            <span className="text-base font-bold text-foreground font-mono">
              {fornecedores.length}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Itens Distintos:</span>
            <span className="text-base font-bold text-foreground font-mono">
              {totalComponentesUnicos}
            </span>
          </div>
          <div className="text-right pl-4 border-l border-border">
            <span className="text-xs text-muted-foreground block font-medium">
              Orçamento Consolidado de Compras:
            </span>
            <span className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {formatBRL(grandTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Relatório Agrupado por Fornecedor */}
      <div className="space-y-6">
        {fornecedores.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground">
                Nenhum componente encontrado para os equipamentos selecionados. Selecione pelo menos
                um BOM com componentes válidos.
              </p>
            </CardContent>
          </Card>
        ) : (
          fornecedores.map((group) => (
            <div
              key={group.fornecedor}
              className="bg-card border border-border rounded-xl overflow-hidden shadow-sm break-inside-avoid"
            >
              {/* Header do Fornecedor */}
              <div className="bg-muted/60 px-5 py-3.5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-primary" />
                  <h2 className="font-bold text-base text-foreground">{group.fornecedor}</h2>
                  <Badge variant="outline" className="text-xs bg-card">
                    {group.totalItens} {group.totalItens === 1 ? 'item' : 'itens'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Subtotal Fornecedor:</span>
                  <span className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-400">
                    {formatBRL(group.totalFornecedor)}
                  </span>
                </div>
              </div>

              {/* Tabela dos Componentes deste Fornecedor */}
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="w-32 font-semibold">Código</TableHead>
                    <TableHead className="font-semibold">Descrição do Componente</TableHead>
                    <TableHead className="w-24 font-semibold text-center">Unid.</TableHead>
                    <TableHead className="w-32 font-semibold text-center">
                      Qtd Total Compra
                    </TableHead>
                    <TableHead className="w-32 font-semibold text-right">Custo Unit.</TableHead>
                    <TableHead className="w-36 font-semibold text-right">Subtotal</TableHead>
                    <TableHead className="w-44 font-semibold">Demanda (SKUs)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.itens.map((item) => (
                    <TableRow key={item.codigo} className="hover:bg-muted/30">
                      <TableCell className="font-mono font-semibold text-primary text-xs">
                        {item.codigo}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-foreground">
                        {item.descricao}
                        <span className="block text-[11px] text-muted-foreground">
                          {item.categoria}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {item.unidade}
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold text-foreground">
                        {formatNumber(item.quantidadeTotal)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {formatBRL(item.custoUnitario)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-xs text-emerald-700 dark:text-emerald-400">
                        {formatBRL(item.custoTotal)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.origemSkus.map((sku) => (
                            <Badge
                              key={sku}
                              variant="secondary"
                              className="text-[10px] font-mono py-0"
                            >
                              {sku}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))
        )}
      </div>

      {/* Rodapé Resumo para Impressão */}
      <div className="hidden print:block p-4 border border-border rounded-lg text-right">
        <p className="text-sm font-bold">TOTAL GERAL DE COMPRAS: {formatBRL(grandTotal)}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Gerado em {new Date().toLocaleDateString('pt-BR')} via ERP Refrigeração Comercial
        </p>
      </div>
    </div>
  )
}
