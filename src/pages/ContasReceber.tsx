import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { contasReceberService, type FiltrosContasReceber } from '@/services/contasReceber'
import {
  LABEL_FORMA_PAGAMENTO,
  LABEL_STATUS_PARCELA,
  type ContaReceber,
  type FormaPagamento,
  saldoAberto,
  statusEfetivo,
} from '@/types/financeiro'
import { Loader2 } from 'lucide-react'
import CondicoesPagamentoCard from '@/components/financeiro/CondicoesPagamentoCard'

interface FaixaAging {
  titulo: string
  contas: ContaReceber[]
}

function diasAtraso(vencimento: string): number {
  const venc = new Date(vencimento)
  const hoje = new Date()
  venc.setHours(0, 0, 0, 0)
  hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - venc.getTime()) / 86400000)
}

function montarAging(contas: ContaReceber[]): FaixaAging[] {
  const abertas = contas.filter((c) => c.status !== 'pago' && c.status !== 'cancelado')
  const faixas: FaixaAging[] = [
    { titulo: 'A vencer', contas: [] },
    { titulo: '1-30 dias', contas: [] },
    { titulo: '31-60 dias', contas: [] },
    { titulo: '61-90 dias', contas: [] },
    { titulo: '+90 dias', contas: [] },
  ]
  for (const c of abertas) {
    const atraso = diasAtraso(c.vencimento)
    if (atraso <= 0) faixas[0].contas.push(c)
    else if (atraso <= 30) faixas[1].contas.push(c)
    else if (atraso <= 60) faixas[2].contas.push(c)
    else if (atraso <= 90) faixas[3].contas.push(c)
    else faixas[4].contas.push(c)
  }
  return faixas
}

const badgeVariantByStatus: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendente: 'secondary',
  parcial: 'outline',
  pago: 'default',
  atrasado: 'destructive',
  cancelado: 'outline',
}

export default function ContasReceberPage() {
  const { toast } = useToast()
  const [contas, setContas] = useState<ContaReceber[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtros, setFiltros] = useState<FiltrosContasReceber>({})
  const [alvo, setAlvo] = useState<ContaReceber | null>(null)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [dataPagamento, setDataPagamento] = useState('')
  const [valorInput, setValorInput] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [observacao, setObservacao] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const lista = await contasReceberService.listar(filtros)
      setContas(lista)
    } catch (err) {
      console.error('Erro ao carregar contas a receber', err)
      toast({
        title: 'Erro ao carregar contas a receber',
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
    const totalAReceber = abertas.reduce((s, c) => s + saldoAberto(c), 0)
    const recebido = contas
      .filter((c) => c.status === 'pago' || c.status === 'parcial')
      .reduce((s, c) => s + (Number(c.valor_recebido) || 0), 0)
    const emAtraso = abertas
      .filter((c) => diasAtraso(c.vencimento) > 0)
      .reduce((s, c) => s + saldoAberto(c), 0)
    return { totalAReceber, recebido, emAtraso, quantidadeAbertas: abertas.length }
  }, [contas])

  const aging = useMemo(() => montarAging(contas), [contas])

  function abrirBaixa(conta: ContaReceber) {
    setAlvo(conta)
    const saldo = saldoAberto(conta)
    setDataPagamento(new Date().toISOString().slice(0, 10))
    setValorInput(saldo.toFixed(2))
    setForma('pix')
    setObservacao('')
    setDialogAberto(true)
  }

  async function confirmarBaixa() {
    if (!alvo) return
    const valor = Number(valorInput.replace(',', '.'))
    const saldo = saldoAberto(alvo)
    if (!dataPagamento) {
      toast({ title: 'Informe a data do recebimento', variant: 'destructive' })
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
      await contasReceberService.receber(alvo.id, {
        data_pagamento: dataPagamento,
        valor,
        forma_pagamento: forma,
        observacao,
      })
      toast({
        title: valor < saldo - 0.005 ? 'Baixa parcial registrada' : 'Parcela quitada',
        description: `${formatBRL(valor)} recebido em ${dataPagamento.split('-').reverse().join('/')}`,
      })
      setDialogAberto(false)
      setAlvo(null)
      await carregar()
    } catch (err) {
      console.error('Erro ao registrar baixa', err)
      toast({ title: 'Erro ao registrar baixa', description: String(err), variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  const clientePlaceholder = contas[0]?.cliente_nome || 'Cliente'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contas a Receber</h1>
        <p className="text-muted-foreground text-sm">
          Parcelas geradas automaticamente a partir do faturamento (pré-nota emitida).
        </p>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total a receber
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatBRL(resumo.totalAReceber)}</p>
            <p className="text-xs text-muted-foreground">
              {resumo.quantidadeAbertas} parcela(s) em aberto
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recebido</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatBRL(resumo.recebido)}</p>
            <p className="text-xs text-muted-foreground">soma dos recebimentos registrados</p>
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

      <CondicoesPagamentoCard />

      {/* Aging */}
      <div className="grid gap-4 md:grid-cols-5">
        {aging.map((faixa) => {
          const total = faixa.contas.reduce((s, c) => s + saldoAberto(c), 0)
          return (
            <Card key={faixa.titulo}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {faixa.titulo}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className={`text-lg font-semibold ${faixa.titulo !== 'A vencer' ? 'text-orange-600' : ''}`}
                >
                  {formatBRL(total)}
                </p>
                <p className="text-xs text-muted-foreground">{faixa.contas.length} parcela(s)</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Label htmlFor="filtro-cliente">Cliente</Label>
          <Input
            id="filtro-cliente"
            placeholder={clientePlaceholder !== 'Cliente' ? clientePlaceholder : 'Buscar cliente'}
            value={filtros.cliente || ''}
            onChange={(e) => setFiltros((f) => ({ ...f, cliente: e.target.value || undefined }))}
          />
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
        <div>
          <Label htmlFor="filtro-de">Vencimento de</Label>
          <Input
            id="filtro-de"
            type="date"
            value={filtros.vencimentoDe || ''}
            onChange={(e) =>
              setFiltros((f) => ({ ...f, vencimentoDe: e.target.value || undefined }))
            }
          />
        </div>
        <div>
          <Label htmlFor="filtro-ate">Vencimento até</Label>
          <Input
            id="filtro-ate"
            type="date"
            value={filtros.vencimentoAte || ''}
            onChange={(e) =>
              setFiltros((f) => ({ ...f, vencimentoAte: e.target.value || undefined }))
            }
          />
        </div>
        <Button variant="ghost" onClick={() => setFiltros({})} className="mb-0.5">
          Limpar filtros
        </Button>
      </div>

      {/* Lista de parcelas */}
      <Card>
        <CardContent className="p-0">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando parcelas...
            </div>
          ) : contas.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma parcela encontrada. Elas são geradas automaticamente quando um faturamento é
              emitido.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Faturamento</th>
                    <th className="px-4 py-3 font-medium">Parcela</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Recebido</th>
                    <th className="px-4 py-3 font-medium">Vencimento</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Forma pag.</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contas.map((c) => {
                    const efetivo = statusEfetivo(c)
                    const saldo = saldoAberto(c)
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <p className="font-medium">{c.cliente_nome}</p>
                          {c.cliente_cnpj && (
                            <p className="text-xs text-muted-foreground">{c.cliente_cnpj}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {c.faturamento_numero}
                          {c.proposta_numero && (
                            <p className="text-xs text-muted-foreground">
                              Prop. {c.proposta_numero}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {c.numero_parcela}/{c.total_parcelas}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatBRL(c.valor_parcela)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(Number(c.valor_recebido) || 0) > 0 ? formatBRL(c.valor_recebido) : '—'}
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
                            {LABEL_STATUS_PARCELA[efetivo] || efetivo}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {c.forma_pagamento
                            ? LABEL_FORMA_PAGAMENTO[c.forma_pagamento] || c.forma_pagamento
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {saldo > 0 && c.status !== 'cancelado' && (
                            <Button size="sm" onClick={() => abrirBaixa(c)}>
                              Receber
                            </Button>
                          )}
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

      {/* Diálogo de baixa */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receber parcela</DialogTitle>
            <DialogDescription>
              {alvo
                ? `${alvo.cliente_nome} — parcela ${alvo.numero_parcela}/${alvo.total_parcelas} de ${alvo.faturamento_numero}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {alvo && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor da parcela</span>
                  <span className="font-medium">{formatBRL(alvo.valor_parcela)}</span>
                </div>
                {(Number(alvo.valor_recebido) || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Já recebido</span>
                    <span className="font-medium">{formatBRL(alvo.valor_recebido)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo em aberto</span>
                  <span className="font-semibold">{formatBRL(saldoAberto(alvo))}</span>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="baixa-data">Data do recebimento</Label>
                  <Input
                    id="baixa-data"
                    type="date"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="baixa-valor">Valor recebido</Label>
                  <Input
                    id="baixa-valor"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={saldoAberto(alvo)}
                    value={valorInput}
                    onChange={(e) => setValorInput(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Menor que o saldo registra baixa parcial.
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
                <Label htmlFor="baixa-obs">Observação</Label>
                <Input
                  id="baixa-obs"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={confirmarBaixa} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
