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
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  Building2,
  ScrollText,
  Printer,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { contratosService } from '@/services/contratos'
import type { Contrato } from '@/types/erp'
import { formatBRL, formatDateTime } from '@/utils/formatters'
import { imprimirContrato } from '@/utils/contratoPdf'

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

  // Diálogo para visualização de histórico de contratos do cliente
  const [clienteHistorico, setClienteHistorico] = useState<Cliente | null>(null)
  const [contratosCliente, setContratosCliente] = useState<Contrato[]>([])
  const [carregandoContratos, setCarregandoContratos] = useState(false)

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
      razao_social: c.razao_social,
      cnpj: c.cnpj || '',
      endereco: c.endereco || '',
      cidade: c.cidade || '',
      uf: c.uf || '',
      contato: c.contato || '',
      email: c.email || '',
      telefone: c.telefone || '',
      criador: c.criador || '',
    })
    setIsDialogOpen(true)
  }

  const handleVerContratos = async (c: Cliente) => {
    setClienteHistorico(c)
    setCarregandoContratos(true)
    try {
      // Busca tanto por ID do cliente quanto por Razão Social
      const porId = await contratosService.getByClienteId(c.id)
      const porNome = await contratosService.getByClienteNome(c.razao_social)
      const mapa = new Map<string, Contrato>()
      porId.forEach((it) => mapa.set(it.id, it))
      porNome.forEach((it) => mapa.set(it.id, it))
      setContratosCliente(Array.from(mapa.values()))
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar contratos do cliente.')
    } finally {
      setCarregandoContratos(false)
    }
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
                        className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                        title="Ver Contratos do Cliente"
                        onClick={() => handleVerContratos(c)}
                      >
                        <ScrollText className="h-3.5 w-3.5" />
                      </Button>
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
                  onChange={(e) => setForm((prev) => ({ ...prev, uf: e.target.value }))}
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

      {/* Modal Histórico de Contratos do Cliente */}
      <Dialog
        open={Boolean(clienteHistorico)}
        onOpenChange={(open) => !open && setClienteHistorico(null)}
      >
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />
              <span>Contratos de {clienteHistorico?.razao_social}</span>
            </DialogTitle>
            <DialogDescription>
              Histórico de contratos comerciais gerados para este cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2">
            {carregandoContratos ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Carregando contratos...
              </p>
            ) : contratosCliente.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto stroke-1" />
                <p className="text-sm text-foreground font-medium">
                  Nenhum contrato gerado para este cliente até o momento.
                </p>
                <p className="text-xs text-muted-foreground">
                  Quando uma proposta for aprovada/vendida, clique em "Gerar Contrato" para
                  emiti-lo.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {contratosCliente.map((ct) => (
                  <div
                    key={ct.id}
                    className="p-3 rounded-lg border border-border bg-card flex items-center justify-between gap-3 hover:border-primary/40 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">
                          {ct.numero}
                        </span>
                        {ct.proposta_numero && (
                          <Badge variant="outline" className="text-[10px]">
                            Prop. {ct.proposta_numero}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Modelo: {ct.modelo_titulo || 'Padrão'}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Data: {ct.created ? formatDateTime(ct.created) : '—'} • Valor:{' '}
                        <strong className="text-foreground font-mono">
                          {ct.valor_total ? formatBRL(ct.valor_total) : '—'}
                        </strong>
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        imprimirContrato({
                          numero: ct.numero,
                          cliente: ct.cliente_nome,
                          cnpj: ct.cliente_cnpj,
                          conteudo: ct.conteudo,
                          dataGeracao: ct.created ? formatDateTime(ct.created) : undefined,
                        })
                      }
                      className="gap-1.5 text-xs h-8"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>PDF</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setClienteHistorico(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
