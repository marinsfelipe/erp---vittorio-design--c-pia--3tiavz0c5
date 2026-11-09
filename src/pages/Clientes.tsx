import { useEffect, useState } from 'react'
import { clientesService } from '@/services/clientes'
import type { Cliente, ClienteInput } from '@/types/erp'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { Users, Plus, Pencil, Trash2, Search, Building2 } from 'lucide-react'
import { toast } from 'sonner'

const vazio: ClienteInput = {
  razao_social: '',
  cnpj: '',
  endereco: '',
  cidade: '',
  uf: '',
  contato: '',
  email: '',
  telefone: '',
  criador: '',
}

const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]

/** Máscara simples de CNPJ: 00.000.000/0000-00 */
function mascararCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  let out = d
  if (d.length > 2) out = d.slice(0, 2) + '.' + d.slice(2)
  if (d.length > 5) out = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5)
  if (d.length > 8)
    out = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8)
  if (d.length > 12)
    out =
      d.slice(0, 2) +
      '.' +
      d.slice(2, 5) +
      '.' +
      d.slice(5, 8) +
      '/' +
      d.slice(8, 12) +
      '-' +
      d.slice(12)
  return out
}

export default function ClientesPage() {
  const { user } = useAuth()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ClienteInput>(vazio)

  const load = async () => {
    setIsLoading(true)
    try {
      setClientes(await clientesService.getAll())
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar clientes.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleOpenCreate = () => {
    setEditingId(null)
    setForm({ ...vazio, criador: user?.id ?? '' })
    setIsDialogOpen(true)
  }

  const handleOpenEdit = (c: Cliente) => {
    setEditingId(c.id)
    setForm({
      razao_social: c.razao_social ?? '',
      cnpj: c.cnpj ?? '',
      endereco: c.endereco ?? '',
      cidade: c.cidade ?? '',
      uf: c.uf ?? '',
      contato: c.contato ?? '',
      email: c.email ?? '',
      telefone: c.telefone ?? '',
      criador: c.criador,
    })
    setIsDialogOpen(true)
  }

  const set = (k: keyof ClienteInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.razao_social.trim()) {
      toast.error('Informe a razão social.')
      return
    }
    if (!form.criador) {
      toast.error('Usuário inválido — faça login novamente.')
      return
    }
    setIsSaving(true)
    try {
      if (editingId) {
        await clientesService.update(editingId, form)
        toast.success('Cliente atualizado!')
      } else {
        await clientesService.create(form)
        toast.success('Cliente cadastrado com sucesso!')
      }
      setIsDialogOpen(false)
      load()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao salvar cliente.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (c: Cliente) => {
    if (!window.confirm(`Excluir o cliente "${c.razao_social}"?`)) return
    setIsDeleting(c.id)
    try {
      await clientesService.delete(c.id)
      toast.success('Cliente excluído.')
      setClientes((prev) => prev.filter((x) => x.id !== c.id))
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir cliente.')
    } finally {
      setIsDeleting(null)
    }
  }

  const filtrados = clientes.filter((c) => {
    if (!searchTerm.trim()) return true
    const q = searchTerm.toLowerCase()
    return (
      (c.razao_social || '').toLowerCase().includes(q) ||
      (c.cnpj || '').includes(q) ||
      (c.cidade || '').toLowerCase().includes(q) ||
      (c.contato || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Clientes</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastro de clientes para uso nas propostas de venda
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      {/* Busca */}
      <div className="relative md:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por razão social, CNPJ, cidade ou contato..."
          className="pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Carregando clientes...</div>
      ) : filtrados.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <Users className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="font-semibold text-foreground text-lg">Nenhum cliente cadastrado</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {searchTerm
                ? 'Nenhum cliente encontrado para a busca.'
                : 'Cadastre o primeiro cliente para usá-lo nas propostas.'}
            </p>
            {!searchTerm && (
              <Button onClick={handleOpenCreate} className="mt-2">
                Cadastrar Primeiro Cliente
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="font-semibold">Razão Social</TableHead>
                <TableHead className="font-semibold">CNPJ</TableHead>
                <TableHead className="font-semibold">Cidade / UF</TableHead>
                <TableHead className="font-semibold">Contato</TableHead>
                <TableHead className="font-semibold">E-mail</TableHead>
                <TableHead className="font-semibold">Telefone</TableHead>
                <TableHead className="w-24 text-right font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/30">
                  <TableCell className="text-sm font-medium text-foreground max-w-[220px] truncate">
                    {c.razao_social}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {c.cnpj || '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.cidade ? `${c.cidade}/${c.uf || '—'}` : '—'}
                  </TableCell>
                  <TableCell className="text-sm">{c.contato || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.email || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.telefone || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Editar"
                        onClick={() => handleOpenEdit(c)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive/70 hover:text-destructive"
                        disabled={isDeleting === c.id}
                        onClick={() => handleDelete(c)}
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Modal Novo/Editar Cliente */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
            <DialogDescription>
              Preencha os dados cadastrais do cliente. Eles ficam disponíveis para uso nas
              propostas.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="razao_social">Razão Social *</Label>
              <Input
                id="razao_social"
                placeholder="Nome empresarial da empresa"
                value={form.razao_social}
                onChange={set('razao_social')}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  placeholder="00.000.000/0000-00"
                  value={form.cnpj || ''}
                  onChange={(e) => setForm((p) => ({ ...p, cnpj: mascararCnpj(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contato">Contato</Label>
                <Input
                  id="contato"
                  placeholder="Nome da pessoa de contato"
                  value={form.contato || ''}
                  onChange={set('contato')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="endereco">Endereço</Label>
              <Input
                id="endereco"
                placeholder="Rua, número, bairro, complemento"
                value={form.endereco || ''}
                onChange={set('endereco')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Input
                  id="cidade"
                  placeholder="Cidade"
                  value={form.cidade || ''}
                  onChange={set('cidade')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="uf">UF</Label>
                <select
                  id="uf"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={form.uf || ''}
                  onChange={set('uf')}
                >
                  <option value="">—</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="contato@empresa.com.br"
                  value={form.email || ''}
                  onChange={set('email')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  placeholder="(00) 00000-0000"
                  value={form.telefone || ''}
                  onChange={set('telefone')}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Cadastrar Cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
