import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { formatBRL } from '@/utils/formatters'
import { contasPagarService } from '@/services/contasPagar'
import type { FiltrosContasPagar } from '@/services/contasPagar'
import {
  CATEGORIAS_DESPESA,
  LABEL_FORMA_PAGAMENTO,
  LABEL_STATUS_CONTA_PAGAR,
  type ContaPagar,
  type FormaPagamento,
  saldoAbertoPagar,
  statusEfetivoPagar,
} from '@/types/financeiro'
import { Loader2, Pencil, Plus, Wallet } from 'lucide-react'
import AlertasFinanceiro from '@/components/financeiro/AlertasFinanceiro'

interface FormDespesa {
  fornecedor: string
  descricao: string
  categoria: string
  valor: string
  vencimento: string
  observacoes: string
}

const DESPESA_VAZIA: FormDespesa = {
  fornecedor: '',
  descricao: '',
  categoria: 'Aluguel',
  valor: '',
  vencimento: '',
  observacoes: '',
}

function diasAtraso(vencimento: string): number {
  const venc = new Date(vencimento)
  const hoje = new Date()
  venc.setHours(0, 0, 0, 0)
  hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - venc.getTime()) / 86400000)
}

const badgeVariantByStatus: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendente: 'secondary',
  parcial: 'outline',
  pago: 'default',
  atrasado: 'destructive',
  cancelado: 'outline',
}

export default function ContasPagarPage() {
  const { toast } = useToast()
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtros, setFiltros] = useState<FiltrosContasPagar>({})
  const [salvando, setSalvando] = useState(false)

  // ---------- diálogo de baixa (Pagar) ----------
  const [alvo, setAlvo] = useState<ContaPagar | null>(null)
  const [dialogPagar, setDialogPagar] = useState(false)
  const [dataPagamento, setDataPagamento] = useState('')
  const [valorInput, setValorInput] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [observacao, setObservacao] = useState('')

  // ---------- diálogo de despesa avulsa / edição ----------
  const [dialogDespesa, setDialogDespesa] = useState(false)
  const [editando, setEditando] = useState<ContaPagar | null>(null)
  const [formDespesa, setFormDespesa] = useState<FormDespesa>(DESPESA_VAZIA)

  // ---------- diálogo de prazo de fornecedores ----------
  const [dialogPrazo, setDialogPrazo] = useState(false)
  const [prazoId, setPrazoId] = useState('')
  const [prazoDias, setPrazoDias] = useState('30')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const lista = await contasPagarService.listar(filtros)
      setContas(lista)
    } catch (err) {
      console.error('Erro ao carregar contas a pagar', err)
      toast({
        title: 'Erro ao carregar contas a pagar',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [filtros, toast])

  useEffect(() => {
    carregar()
  }, [carregar])

  const resumo = useMemo(() => {
    const abertas = contas.filter((c) => c.status !== 'pago' && c.status !== 'cancelado')
    const totalAPagar = abertas.reduce((s, c) => s + saldoAbertoPagar(c), 0)
    const pago = contas
      .filter((c) => c.status === 'pago' || c.status === 'parcial')
      .reduce((s, c) => s + (Number(c.valor_pago) || 0), 0)
    const emAtraso = abertas
      .filter((c) => diasAtraso(c.vencimento) > 0)
      .reduce((s, c) => s + saldoAbertoPagar(c), 0)
    return { totalAPagar, pago, emAtraso, quantidadeAbertas: abertas.length }
  }, [contas])

  const fornecedores = useMemo(() => {
    const nomes = new Set<string>()
    for (const c of contas) {
      if (c.fornecedor) nomes.add(c.fornecedor)
    }
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [contas])

  // --------------------------- baixa (Pagar) ---------------------------
  function abrirBaixa(conta: ContaPagar) {
    setAlvo(conta)
    const saldo = saldoAbertoPagar(conta)
    setDataPagamento(new Date().toISOString().slice(0, 10))
    setValorInput(saldo.toFixed(2))
    setForma('pix')
    setObservacao('')
    setDialogPagar(true)
  }

  async function confirmarBaixa() {
    if (!alvo) return
    const valor = Number(valorInput.replace(',', '.'))
    const saldo = saldoAbertoPagar(alvo)
    if (!dataPagamento) {
      toast({ title: 'Informe a data do pagamento', variant: 'destructive' })
      return
    }
    if (!valor || valor <= 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' })
      return
    }
    if (valor > saldo + 0.005) {
      toast({
        title: 'Valor maior que o saldo em aberto',
        description: `Saldo: ${formatBRL(saldo)}`,
        variant: 'destructive',
      })
      return
    }
    setSalvando(true)
    try {
      await contasPagarService.pagar(alvo.id, {
        data_pagamento: dataPagamento,
        valor,
        forma_pagamento: forma,
        observacao,
      })
      toast({
        title: valor < saldo - 0.005 ? 'Pagamento parcial registrado' : 'Conta quitada',
        description: `${formatBRL(valor)} pago em ${dataPagamento.split('-').reverse().join('/')}`,
      })
      setDialogPagar(false)
      setAlvo(null)
      await carregar()
    } catch (err) {
      console.error('Erro ao registrar pagamento', err)
      toast({
        title: 'Erro ao registrar pagamento',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // ------------------ despesa avulsa / edição ------------------
  function abrirNovaDespesa() {
    setEditando(null)
    setFormDespesa({ ...DESPESA_VAZIA, vencimento: new Date().toISOString().slice(0, 10) })
    setDialogDespesa(true)
  }

  function abrirEdicao(conta: ContaPagar) {
    setEditando(conta)
    setFormDespesa({
      fornecedor: conta.fornecedor || '',
      descricao: conta.descricao || '',
      categoria: conta.categoria || 'Outros',
      valor: String(conta.valor ?? ''),
      vencimento: conta.vencimento ? conta.vencimento.slice(0, 10) : '',
      observacoes: conta.observacoes || '',
    })
    setDialogDespesa(true)
  }

  async function salvarDespesa() {
    const f = formDespesa
    if (!f.fornecedor.trim()) {
      toast({ title: 'Informe o fornecedor/beneficiário', variant: 'destructive' })
      return
    }
    if (!f.valor || Number(f.valor.replace(',', '.')) <= 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' })
      return
    }
    if (!f.vencimento) {
      toast({ title: 'Informe o vencimento', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      const dados = {
        fornecedor: f.fornecedor.trim(),
        descricao: f.descricao.trim(),
        categoria: f.categoria.trim() || 'Outros',
        valor: Number(f.valor.replace(',', '.')),
        vencimento: f.vencimento,
        observacoes: f.observacoes.trim(),
      }
      if (editando) {
        await contasPagarService.editar(editando.id, dados)
        toast({ title: 'Conta atualizada' })
      } else {
        await contasPagarService.criarDespesa(dados)
        toast({
          title: 'Despesa lançada',
          description: `${formatBRL(dados.valor)} — ${dados.categoria}`,
        })
      }
      setDialogDespesa(false)
      setEditando(null)
      await carregar()
    } catch (err) {
      console.error('Erro ao salvar conta a pagar', err)
      toast({ title: 'Erro ao salvar', description: String(err), variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  async function cancelarConta(conta: ContaPagar) {
    if (editando && editando.id === conta.id) {
      setDialogDespesa(false)
      setEditando(null)
    }
    setSalvando(true)
    try {
      await contasPagarService.cancelar(conta.id)
      toast({ title: 'Conta cancelada', description: conta.fornecedor })
      await carregar()
    } catch (err) {
      console.error('Erro ao cancelar conta', err)
      toast({ title: 'Erro ao cancelar', description: String(err), variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  // ------------------ prazo de fornecedores ------------------
  async function abrirPrazo() {
    setDialogPrazo(true)
    try {
      const p = await contasPagarService.listarPrazoFornecedor()
      setPrazoId(p.id)
      setPrazoDias(String(p.dias))
    } catch (err) {
      console.error('Erro ao carregar prazo de fornecedores', err)
      toast({ title: 'Parâmetro não encontrado', description: String(err), variant: 'destructive' })
    }
  }

  async function salvarPrazo() {
    const dias = Number(prazoDias)
    if (!dias || dias < 0) {
      toast({ title: 'Informe um prazo em dias válido', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      await contasPagarService.salvarPrazoFornecedor(prazoId, dias)
      toast({
        title: 'Prazo atualizado',
        description: `Novas contas de ordens de compra vencem em ${dias} dia(s).`,
      })
      setDialogPrazo(false)
    } catch (err) {
      console.error('Erro ao salvar prazo', err)
      toast({ title: 'Erro ao salvar prazo', description: String(err), variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contas a Pagar</h1>
          <p className="text-muted-foreground text-sm">
            Contas geradas automaticamente das ordens de compra concluídas e lançamentos avulsos de
            despesas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={abrirPrazo}>
            <Wallet className="mr-2 h-4 w-4" /> Prazo fornecedores
          </Button>
          <Button onClick={abrirNovaDespesa}>
            <Plus className="mr-2 h-4 w-4" /> Nova despesa
          </Button>
        </div>
      </div>

      <AlertasFinanceiro />

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total a pagar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatBRL(resumo.totalAPagar)}</p>
            <p className="text-xs text-muted-foreground">
              {resumo.quantidadeAbertas} conta(s) em aberto
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pago</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatBRL(resumo.pago)}</p>
            <p className="text-xs text-muted-foreground">soma dos pagamentos registrados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Em atraso</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{formatBRL(resumo.emAtraso)}</p>
            <p className="text-xs text-muted-foreground">vencimento já passado</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Label htmlFor="filtro-fornecedor">Fornecedor</Label>
          {fornecedores.length > 0 ? (
            <Select
              value={filtros.fornecedor || 'todos'}
              onValueChange={(v) =>
                setFiltros((f) => ({ ...f, fornecedor: v === 'todos' ? undefined : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {fornecedores.map((nome) => (
                  <SelectItem key={nome} value={nome}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="filtro-fornecedor"
              placeholder="Buscar fornecedor"
              value={filtros.fornecedor || ''}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, fornecedor: e.target.value || undefined }))
              }
            />
          )}
        </div>
        <div className="w-44">
          <Label>Status</Label>
          <Select
            value={filtros.status || 'todos'}
            onValueChange={(v) =>
              setFiltros((f) => ({ ...f, status: v === 'todos' ? undefined : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
              <SelectItem value="parcial">Pago parcial</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" onClick={() => setFiltros({})} className="mb-0.5">
          Limpar filtros
        </Button>
      </div>

      {/* Lista de contas */}
      <Card>
        <CardContent className="p-0">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando contas...
            </div>
          ) : contas.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma conta encontrada. Elas são geradas automaticamente quando uma ordem de compra
              é concluída — ou use “Nova despesa” para lançar avulsos.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Fornecedor</th>
                    <th className="px-4 py-3 font-medium">Descrição</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Pago</th>
                    <th className="px-4 py-3 font-medium">Vencimento</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Forma pag.</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contas.map((c) => {
                    const efetivo = statusEfetivoPagar(c)
                    const saldo = saldoAbertoPagar(c)
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <p className="font-medium">{c.fornecedor}</p>
                          {c.ordem_numero && (
                            <p className="text-xs text-muted-foreground">OC {c.ordem_numero}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <p className="truncate">{c.descricao || '—'}</p>
                          {c.observacoes && (
                            <p className="text-xs text-muted-foreground truncate">
                              {c.observacoes}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {c.categoria ? <Badge variant="outline">{c.categoria}</Badge> : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatBRL(c.valor)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(Number(c.valor_pago) || 0) > 0 ? formatBRL(c.valor_pago) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {new Date(c.vencimento).toLocaleDateString('pt-BR')}
                          {efetivo === 'atrasado' && (
                            <p className="text-xs text-red-600">
                              {diasAtraso(c.vencimento)} dia(s) em atraso
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={badgeVariantByStatus[efetivo] || 'secondary'}>
                            {LABEL_STATUS_CONTA_PAGAR[efetivo] || efetivo}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {c.forma_pagamento
                            ? LABEL_FORMA_PAGAMENTO[c.forma_pagamento] || c.forma_pagamento
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {saldo > 0 && c.status !== 'cancelado' && (
                              <Button size="sm" onClick={() => abrirBaixa(c)}>
                                Pagar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => abrirEdicao(c)}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {c.status !== 'cancelado' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                disabled={salvando}
                                onClick={() => cancelarConta(c)}
                                title="Cancelar conta"
                              >
                                ✕
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de baixa (Pagar) */}
      <Dialog open={dialogPagar} onOpenChange={setDialogPagar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar conta</DialogTitle>
            <DialogDescription>
              {alvo
                ? `${alvo.fornecedor}${alvo.ordem_numero ? ` — OC ${alvo.ordem_numero}` : ''}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {alvo && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor da conta</span>
                  <span className="font-medium">{formatBRL(alvo.valor)}</span>
                </div>
                {(Number(alvo.valor_pago) || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Já pago</span>
                    <span className="font-medium">{formatBRL(alvo.valor_pago)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo em aberto</span>
                  <span className="font-semibold">{formatBRL(saldoAbertoPagar(alvo))}</span>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pag-data">Data do pagamento</Label>
                  <Input
                    id="pag-data"
                    type="date"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="pag-valor">Valor pago</Label>
                  <Input
                    id="pag-valor"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={saldoAbertoPagar(alvo)}
                    value={valorInput}
                    onChange={(e) => setValorInput(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Menor que o saldo registra pagamento parcial.
                  </p>
                </div>
              </div>
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={forma} onValueChange={(v) => setForma(v as FormaPagamento)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LABEL_FORMA_PAGAMENTO) as FormaPagamento[]).map((f) => (
                      <SelectItem key={f} value={f}>
                        {LABEL_FORMA_PAGAMENTO[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pag-obs">Observação</Label>
                <Input
                  id="pag-obs"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogPagar(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={confirmarBaixa} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de despesa avulsa / edição */}
      <Dialog open={dialogDespesa} onOpenChange={setDialogDespesa}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar conta' : 'Nova despesa'}</DialogTitle>
            <DialogDescription>
              {editando
                ? 'Ajuste os dados da conta. Pagamentos registrados não são alterados aqui.'
                : 'Lançamento avulso de despesa (aluguel, energia, insumos etc.).'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="desp-fornecedor">Fornecedor / beneficiário *</Label>
                <Input
                  id="desp-fornecedor"
                  value={formDespesa.fornecedor}
                  onChange={(e) => setFormDespesa((f) => ({ ...f, fornecedor: e.target.value }))}
                  placeholder="Ex.: Cia. de Luz"
                />
              </div>
              <div>
                <Label htmlFor="desp-categoria">Categoria *</Label>
                {editando ? (
                  <Input
                    id="desp-categoria"
                    value={formDespesa.categoria}
                    onChange={(e) => setFormDespesa((f) => ({ ...f, categoria: e.target.value }))}
                  />
                ) : (
                  <>
                    <Input
                      id="desp-categoria"
                      list="categorias-despesa"
                      value={formDespesa.categoria}
                      onChange={(e) => setFormDespesa((f) => ({ ...f, categoria: e.target.value }))}
                      placeholder="Selecione ou digite"
                    />
                    <datalist id="categorias-despesa">
                      {CATEGORIAS_DESPESA.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="desp-descricao">Descrição</Label>
              <Input
                id="desp-descricao"
                value={formDespesa.descricao}
                onChange={(e) => setFormDespesa((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Ex.: Aluguel do galpão — março/2026"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="desp-valor">Valor (R$) *</Label>
                <Input
                  id="desp-valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formDespesa.valor}
                  onChange={(e) => setFormDespesa((f) => ({ ...f, valor: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="desp-venc">Vencimento *</Label>
                <Input
                  id="desp-venc"
                  type="date"
                  value={formDespesa.vencimento}
                  onChange={(e) => setFormDespesa((f) => ({ ...f, vencimento: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="desp-obs">Observações</Label>
              <Textarea
                id="desp-obs"
                rows={2}
                value={formDespesa.observacoes}
                onChange={(e) => setFormDespesa((f) => ({ ...f, observacoes: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            {editando && (
              <Button
                variant="destructive"
                className="mr-auto"
                disabled={salvando}
                onClick={() => cancelarConta(editando)}
              >
                Cancelar conta
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogDespesa(false)} disabled={salvando}>
              Fechar
            </Button>
            <Button onClick={salvarDespesa} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editando ? 'Salvar alterações' : 'Lançar despesa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo do prazo padrão de fornecedores */}
      <Dialog open={dialogPrazo} onOpenChange={setDialogPrazo}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Prazo de pagamento a fornecedores</DialogTitle>
            <DialogDescription>
              Vencimento das contas geradas automaticamente a partir das ordens de compra
              concluídas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="prazo-dias">Prazo padrão (dias)</Label>
              <Input
                id="prazo-dias"
                type="number"
                min="0"
                value={prazoDias}
                onChange={(e) => setPrazoDias(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Parâmetro administrativo — não entra na fórmula de precificação.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogPrazo(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvarPrazo} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar prazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
