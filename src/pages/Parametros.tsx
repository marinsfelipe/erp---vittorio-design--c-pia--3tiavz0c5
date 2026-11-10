import React, { useEffect, useState } from 'react'
import { parametrosService } from '@/services/parametros'
import type { Parametro } from '@/types/erp'
import { formatPercent } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Percent,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Calculator,
  HelpCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { somaPercentuais } from '@/utils/pricing'
import { AlertTriangle } from 'lucide-react'

export default function ParametrosPage() {
  const [parametros, setParametros] = useState<Parametro[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Parametro | null>(null)

  // Σ% — somatório dos percentuais que compõem o markup divisor (exclui limite comercial de desconto)
  const sigmaPct = somaPercentuais(parametros)
  const sigmaInvalido = sigmaPct >= 100

  // Formulário
  const [formData, setFormData] = useState({
    chave: '',
    nome: '',
    valor_percentual: '',
    descricao: '',
    ordem: '1',
  })

  const loadData = async () => {
    setIsLoading(true)
    try {
      const data = await parametrosService.getAll()
      setParametros(data)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar parâmetros financeiros.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenCreate = () => {
    setEditingItem(null)
    setFormData({
      chave: '',
      nome: '',
      valor_percentual: '',
      descricao: '',
      ordem: String(parametros.length + 1),
    })
    setIsDialogOpen(true)
  }

  const handleOpenEdit = (p: Parametro) => {
    setEditingItem(p)
    setFormData({
      chave: p.chave,
      nome: p.nome,
      valor_percentual: String(p.valor_percentual),
      descricao: p.descricao || '',
      ordem: String(p.ordem || 1),
    })
    setIsDialogOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.nome.trim() || formData.valor_percentual === '') {
      toast.error('Nome e percentual são obrigatórios.')
      return
    }

    const valor = parseFloat(formData.valor_percentual.replace(',', '.')) || 0

    try {
      if (editingItem) {
        await parametrosService.update(editingItem.id, valor, formData.descricao)
        toast.success(`Parâmetro ${editingItem.nome} atualizado!`)
      } else {
        const chave =
          formData.chave.trim().toLowerCase().replace(/\s+/g, '_') ||
          formData.nome.trim().toLowerCase().replace(/\s+/g, '_')

        await parametrosService.create({
          chave,
          nome: formData.nome.trim(),
          valor_percentual: valor,
          descricao: formData.descricao.trim(),
          ordem: parseInt(formData.ordem, 10) || 1,
        })
        toast.success('Parâmetro financeiro criado com sucesso!')
      }
      setIsDialogOpen(false)
      loadData()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao salvar parâmetro financeiro.')
    }
  }

  const handleDelete = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o parâmetro "${nome}"?`)) return
    try {
      await parametrosService.delete(id)
      toast.success('Parâmetro removido com sucesso.')
      setParametros((prev) => prev.filter((p) => p.id !== id))
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir parâmetro.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Percent className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Parâmetros Financeiros de Precificação
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Tabela editável de taxas: margem alvo, overhead fabril e percentuais que alimentam os
            BOMs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/precificacao">
            <Button variant="outline" size="sm" className="gap-2">
              <Calculator className="h-4 w-4" />
              Simular Precificação
            </Button>
          </Link>
          <Button onClick={handleOpenCreate} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Parâmetro
          </Button>
        </div>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {parametros.slice(0, 3).map((p) => (
          <Card key={p.id} className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">
                {p.chave}
              </CardDescription>
              <CardTitle className="text-lg font-bold">{p.nome}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-mono font-bold text-primary">
                  {formatPercent(p.valor_percentual)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenEdit(p)}
                  className="h-8 gap-1 text-xs"
                >
                  <Edit2 className="h-3 w-3" />
                  Editar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                {p.descricao || 'Sem descrição'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerta de Σ% inválido */}
      {sigmaInvalido && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/40 text-destructive p-4 rounded-xl">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">
              Parâmetro inválido — cálculo de precificação bloqueado
            </p>
            <p className="text-xs mt-1">
              O somatório dos percentuais (Σ% = {formatPercent(sigmaPct)}) é maior ou igual a 100%,
              tornando o fator divisor (1 − Σ%) {sigmaPct === 100 ? 'zero' : 'negativo'}. Ajuste a
              tabela antes de precificar.
            </p>
          </div>
        </div>
      )}

      {/* Tabela de Parâmetros */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-16 text-center font-semibold">Ordem</TableHead>
              <TableHead className="w-44 font-semibold">Identificador / Chave</TableHead>
              <TableHead className="font-semibold">Nome do Parâmetro Financeiro</TableHead>
              <TableHead className="w-36 font-semibold text-right">Percentual (%)</TableHead>
              <TableHead className="font-semibold">Descrição e Aplicação na Indústria</TableHead>
              <TableHead className="w-24 font-semibold text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Carregando parâmetros cadastrados...
                </TableCell>
              </TableRow>
            ) : parametros.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Nenhum parâmetro cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              parametros.map((param) => (
                <TableRow key={param.id} className="hover:bg-muted/30">
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {param.ordem || 1}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold text-primary">
                    <Badge variant="outline" className="font-mono text-xs">
                      {param.chave}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{param.nome}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-sm text-emerald-700 dark:text-emerald-400">
                    {formatPercent(param.valor_percentual)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {param.descricao || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleOpenEdit(param)}
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(param.id, param.nome)}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="px-4 py-3 bg-muted/20 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Estes percentuais não são fixos e podem ser customizados pela equipe de engenharia e
            finanças.
          </span>
          <span
            className={`font-mono font-bold flex items-center gap-1.5 ${
              sigmaInvalido ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            Σ% Total: {formatPercent(sigmaPct)}
            {sigmaInvalido && <AlertTriangle className="h-4 w-4" />}
          </span>
          <Button variant="ghost" size="icon" onClick={loadData} title="Recarregar">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Modal Criar / Editar Parâmetro */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? `Editar Parâmetro: ${editingItem.nome}` : 'Novo Parâmetro Financeiro'}
            </DialogTitle>
            <DialogDescription>
              Defina a taxa percentual aplicada sobre o custo ou preço dos equipamentos
              refrigerados.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            {!editingItem && (
              <div className="space-y-1.5">
                <Label htmlFor="param-chave">Chave Identificadora (sem espaços) *</Label>
                <Input
                  id="param-chave"
                  placeholder="Ex: overhead, margem_alvo, frete_padrao"
                  value={formData.chave}
                  onChange={(e) =>
                    setFormData({ ...formData, chave: e.target.value.toLowerCase() })
                  }
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="param-nome">Nome Amigável do Parâmetro *</Label>
              <Input
                id="param-nome"
                placeholder="Ex: Custos Indiretos de Fabricação"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="param-valor">Percentual (%) *</Label>
                <Input
                  id="param-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="14.5"
                  value={formData.valor_percentual}
                  onChange={(e) => setFormData({ ...formData, valor_percentual: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="param-ordem">Ordem de Exibição</Label>
                <Input
                  id="param-ordem"
                  type="number"
                  min="1"
                  value={formData.ordem}
                  onChange={(e) => setFormData({ ...formData, ordem: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="param-desc">Descrição / Composição</Label>
              <Input
                id="param-desc"
                placeholder="Ex: Abrange energia elétrica, manutenção e mão de obra indireta"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editingItem ? 'Salvar Parâmetro' : 'Criar Parâmetro'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
