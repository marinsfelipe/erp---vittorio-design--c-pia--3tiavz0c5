import { useEffect, useState } from 'react'
import { modelosContratoService } from '@/services/modelosContrato'
import type { ModeloContrato, ModeloContratoInput } from '@/types/erp'
import { CAMPOS_VARIAVEIS_DISPONIVEIS } from '@/utils/contratoVariaveis'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Copy,
  Star,
  Search,
  ShieldAlert,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'

const modeloVazio: ModeloContratoInput = {
  titulo: '',
  descricao: '',
  conteudo: '',
  ativo: true,
  padrao: false,
}

export default function ModelosContratoPage() {
  const [modelos, setModelos] = useState<ModeloContrato[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ModeloContratoInput>(modeloVazio)

  const load = async () => {
    setIsLoading(true)
    try {
      const data = await modelosContratoService.getAll()
      setModelos(data)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar modelos de contrato.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleOpenCreate = () => {
    setEditingId(null)
    setForm(modeloVazio)
    setIsDialogOpen(true)
  }

  const handleOpenEdit = (m: ModeloContrato) => {
    setEditingId(m.id)
    setForm({
      titulo: m.titulo,
      descricao: m.descricao || '',
      conteudo: m.conteudo,
      ativo: m.ativo,
      padrao: m.padrao,
    })
    setIsDialogOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.titulo.trim()) {
      toast.error('Informe o título do modelo.')
      return
    }
    if (!form.conteudo.trim()) {
      toast.error('O conteúdo do modelo de contrato não pode ficar em branco.')
      return
    }

    setIsSaving(true)
    try {
      if (editingId) {
        await modelosContratoService.update(editingId, form)
        if (form.padrao) {
          await modelosContratoService.setPadrao(editingId)
        }
        toast.success('Modelo de contrato atualizado com sucesso!')
      } else {
        const criado = await modelosContratoService.create(form)
        if (form.padrao) {
          await modelosContratoService.setPadrao(criado.id)
        }
        toast.success('Modelo de contrato cadastrado com sucesso!')
      }
      setIsDialogOpen(false)
      load()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao salvar modelo de contrato.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este modelo de contrato?')) return
    setIsDeleting(id)
    try {
      await modelosContratoService.delete(id)
      toast.success('Modelo excluído.')
      load()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir modelo.')
    } finally {
      setIsDeleting(null)
    }
  }

  const handleDefinirPadrao = async (id: string) => {
    try {
      await modelosContratoService.setPadrao(id)
      toast.success('Modelo definido como padrão para novos contratos!')
      load()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao definir modelo padrão.')
    }
  }

  const handleCopiarVariavel = (tag: string) => {
    navigator.clipboard.writeText(tag)
    toast.success(`Variável copiada: ${tag}`)
  }

  const filtered = modelos.filter((m) => {
    const q = searchTerm.toLowerCase()
    return m.titulo.toLowerCase().includes(q) || (m.descricao || '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Modelos de Contrato
            </h1>
            <Badge variant="outline" className="border-primary/40 text-primary font-mono text-xs">
              Apenas Administrador
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre e edite minutas institucionais de contrato com substituição automática de
            variáveis
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          Novo Modelo
        </Button>
      </div>

      {/* Caixa de ajuda sobre variáveis */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Info className="h-4 w-4" />
            <span>Campos Variáveis Disponíveis para os Modelos</span>
          </div>
          <CardDescription className="text-xs">
            Ao gerar o contrato na proposta Vendida, o ERP substitui estas variáveis pelos dados
            reais da proposta e do cliente. Clique em uma variável para copiar.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {CAMPOS_VARIAVEIS_DISPONIVEIS.map((v) => (
              <button
                key={v.tag}
                type="button"
                onClick={() => handleCopiarVariavel(v.tag)}
                className="flex flex-col items-start p-2 rounded-lg bg-card border border-border hover:border-primary/60 hover:bg-primary/5 text-left transition-all group"
                title={`${v.descricao} (ex: ${v.exemplo}) - Clique para copiar`}
              >
                <div className="flex items-center justify-between w-full">
                  <code className="text-xs font-bold text-primary font-mono">{v.tag}</code>
                  <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                  {v.descricao}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Busca */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar modelo por título ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Tabela de modelos */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Carregando modelos de contrato...
            </p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto stroke-1" />
              <p className="text-sm font-medium text-foreground">Nenhum modelo cadastrado.</p>
              <p className="text-xs text-muted-foreground">
                Clique no botão "Novo Modelo" acima para criar a primeira minuta institucional.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="font-semibold">Título</TableHead>
                  <TableHead className="font-semibold">Descrição</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Padrão</TableHead>
                  <TableHead className="text-right font-semibold">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span>{m.titulo}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                      {m.descricao || '—'}
                    </TableCell>
                    <TableCell>
                      {m.ativo ? (
                        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-[10px]">
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.padrao ? (
                        <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px] gap-1">
                          <Star className="h-3 w-3 fill-primary text-primary" />
                          Modelo Padrão
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDefinirPadrao(m.id)}
                          className="h-6 text-[10px] text-muted-foreground hover:text-primary gap-1"
                        >
                          <Star className="h-3 w-3" />
                          Tornar Padrão
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(m)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Editar modelo"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(m.id)}
                          disabled={isDeleting === m.id}
                          className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title="Excluir modelo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal de Criação / Edição de Modelo de Contrato */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar Modelo de Contrato' : 'Novo Modelo de Contrato'}
            </DialogTitle>
            <DialogDescription>
              Redija o texto institucional do contrato. Utilize as variáveis disponíveis para
              preenchimento dinâmico.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="titulo" className="text-xs font-semibold">
                  Título do Modelo *
                </Label>
                <Input
                  id="titulo"
                  required
                  placeholder="Ex: Contrato de Fornecimento de Equipamentos"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="descricao" className="text-xs font-semibold">
                  Descrição / Finalidade
                </Label>
                <Input
                  id="descricao"
                  placeholder="Ex: Modelo padrão para clientes varejistas e supermercados"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20">
                <Switch
                  id="ativo"
                  checked={form.ativo}
                  onCheckedChange={(c) => setForm({ ...form, ativo: c })}
                />
                <Label htmlFor="ativo" className="text-xs font-medium cursor-pointer">
                  Modelo ativo para seleção
                </Label>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20">
                <Switch
                  id="padrao"
                  checked={form.padrao}
                  onCheckedChange={(c) => setForm({ ...form, padrao: c })}
                />
                <Label htmlFor="padrao" className="text-xs font-medium cursor-pointer">
                  Marcar como Modelo Padrão
                </Label>
              </div>
            </div>

            {/* Inserção rápida de variáveis */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="conteudo" className="text-xs font-semibold">
                  Corpo do Contrato (Minuta) *
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Clique na tag para copiá-la:
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-muted/30 border border-border">
                {CAMPOS_VARIAVEIS_DISPONIVEIS.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => handleCopiarVariavel(v.tag)}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-card border border-border hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    {v.tag}
                  </button>
                ))}
              </div>

              <Textarea
                id="conteudo"
                rows={16}
                required
                placeholder="Cole ou digite aqui o texto do contrato com as cláusulas e variáveis..."
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                className="font-mono text-xs leading-relaxed"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving} className="gap-2">
                {isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Modelo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
