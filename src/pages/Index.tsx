import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { componentesService } from '@/services/componentes'
import { bomsService } from '@/services/boms'
import { parametrosService } from '@/services/parametros'
import type { Bom, Componente, Parametro } from '@/types/erp'
import { formatBRL, formatPercent } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Cpu,
  Layers,
  Calculator,
  Percent,
  ShoppingCart,
  FileSpreadsheet,
  ArrowRight,
  TrendingUp,
  Package,
  CheckCircle2,
  Snowflake,
} from 'lucide-react'

export default function IndexPage() {
  const [componentesCount, setComponentesCount] = useState(0)
  const [boms, setBoms] = useState<Bom[]>([])
  const [parametros, setParametros] = useState<Parametro[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadOverview() {
      try {
        const [comps, bomsList, params] = await Promise.all([
          componentesService.getAll(),
          bomsService.getAll(),
          parametrosService.getAll(),
        ])
        setComponentesCount(comps.length)
        setBoms(bomsList)
        setParametros(params)
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    loadOverview()
  }, [])

  const overheadParam = parametros.find((p) => p.chave === 'overhead')?.valor_percentual ?? 14.5
  const margemParam = parametros.find((p) => p.chave === 'margem_alvo')?.valor_percentual ?? 28.0

  return (
    <div className="space-y-8">
      {/* Hero Banner Boas-vindas */}
      <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-muted p-6 sm:p-8 border border-primary/20 shadow-xs">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold">
            <Snowflake className="h-3.5 w-3.5" />
            Engenharia & Custos de Refrigeração Comercial
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Painel Geral do ERP Industrial
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Plataforma integrada de engenharia de produto: cadastro técnico de componentes
            frigoríficos, estruturação de BOM por SKU (Balcão Strongest, Vitrine Aprezzo, Expositor
            Fredda), cálculo automático de custos e geração de lista consolidada de compras por
            fornecedor.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link to="/boms">
              <Button className="gap-2">
                <Layers className="h-4 w-4" />
                Explorar BOMs por SKU
              </Button>
            </Link>
            <Link to="/compras">
              <Button variant="outline" className="gap-2">
                <ShoppingCart className="h-4 w-4" />
                Lista Consolidada de Compras
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Catálogo de Peças
            </CardTitle>
            <Cpu className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{componentesCount} itens</div>
            <p className="text-xs text-muted-foreground mt-1">Disponíveis para uso nos BOMs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              BOMs Cadastrados
            </CardTitle>
            <Layers className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{boms.length} SKUs</div>
            <p className="text-xs text-muted-foreground mt-1">Estruturas de montagem ativas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Overhead Padrão
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {formatPercent(overheadParam)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Custos indiretos de fábrica</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Margem Alvo Padrão
            </CardTitle>
            <Percent className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
              {formatPercent(margemParam)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Margem comercial desejada</p>
          </CardContent>
        </Card>
      </div>

      {/* Módulos do Sistema */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">Acesso Rápido aos Módulos</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/componentes" className="group">
            <Card className="h-full hover:border-primary/50 transition-all hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
                <CardTitle className="text-base font-bold mt-2">Catálogo de Componentes</CardTitle>
                <CardDescription className="text-xs">
                  Cadastro com código único, descrição, categoria, unidade, custo unitário e
                  fornecedor principal.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/importar" className="group">
            <Card className="h-full hover:border-primary/50 transition-all hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
                <CardTitle className="text-base font-bold mt-2">Importar Planilha</CardTitle>
                <CardDescription className="text-xs">
                  Carga em lote de componentes via planilha CSV ou TSV, com conferência prévia e
                  modelo para download.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/boms" className="group">
            <Card className="h-full hover:border-primary/50 transition-all hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                    <Layers className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
                <CardTitle className="text-base font-bold mt-2">Editor de BOM Multinível</CardTitle>
                <CardDescription className="text-xs">
                  Estrutura hierárquica por níveis (montagens e subconjuntos) com cálculo de
                  quantidade e custo.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/precificacao" className="group">
            <Card className="h-full hover:border-primary/50 transition-all hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
                    <Calculator className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
                <CardTitle className="text-base font-bold mt-2">Módulo de Precificação</CardTitle>
                <CardDescription className="text-xs">
                  Simulação do preço final: Custo Consolidado × (1 + Overhead + Margem), com
                  recálculo instantâneo.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/parametros" className="group">
            <Card className="h-full hover:border-primary/50 transition-all hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
                    <Percent className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
                <CardTitle className="text-base font-bold mt-2">Parâmetros Financeiros</CardTitle>
                <CardDescription className="text-xs">
                  Tabela customizável de percentuais e despesas indiretas que definem o markup da
                  fábrica.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/compras" className="group">
            <Card className="h-full hover:border-primary/50 transition-all hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
                <CardTitle className="text-base font-bold mt-2">
                  Lista de Compras Consolidada
                </CardTitle>
                <CardDescription className="text-xs">
                  Agrupamento automático por fornecedor, somando quantidades e custos totais com
                  opção de impressão e exportação.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>

      {/* Destaque dos Equipamentos Piloto */}
      <div className="bg-card border border-border p-5 rounded-xl">
        <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          Equipamentos Piloto Carregados no Sistema
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {boms.slice(0, 3).map((b) => (
            <div
              key={b.id}
              className="p-3 bg-muted/40 rounded-lg border border-border flex items-center justify-between"
            >
              <div>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] font-bold text-primary mb-1"
                >
                  {b.sku}
                </Badge>
                <p className="text-xs font-semibold text-foreground">{b.nome}</p>
                <span className="text-[11px] text-muted-foreground">
                  {b.categoria || 'Equipamento Comercial'}
                </span>
              </div>
              <Link to={`/boms/${b.id}`}>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
