import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { formatBRL } from '@/utils/formatters'
import {
  CATEGORIAS_DESPESA,
  LABEL_FORMA_PAGAMENTO,
  type ContaPagar,
  type FormaPagamento,
  saldoAbertoPagar,
} from '@/types/financeiro'

interface DialogPagarProps {
  conta: ContaPagar | null
  aberto: boolean
  salvando: boolean
  onOpenChange: (open: boolean) => void
  onConfirmar: (input: {
    data_pagamento: string
    valor: number
    forma_pagamento: FormaPagamento
    observacao: string
  }) => void
}

export function DialogPagarConta({
  conta,
  aberto,
  salvando,
  onOpenChange,
  onConfirmar,
}: DialogPagarProps) {
  const [dataPagamento, setDataPagamento] = useState('')
  const [valorInput, setValorInput] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    if (conta) {
      setDataPagamento(new Date().toISOString().slice(0, 10))
      setValorInput(saldoAbertoPagar(conta).toFixed(2))
      setForma('pix')
      setObservacao('')
    }
  }, [conta])

  if (!conta) return null
  const saldo = saldoAbertoPagar(conta)
  const valor = Number(valorInput.replace(',', '.'))
  const parcial = valor > 0 && valor < saldo - 0.005

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar conta</DialogTitle>
          <DialogDescription>
            {conta.fornecedor}
            {conta.ordem_numero ? ` — ordem ${conta.ordem_numero}` : ' — despesa avulsa'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor da conta</span>
              <span className="font-medium">{formatBRL(conta.valor)}</span>
            </div>
            {(Number(conta.valor_pago) || 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Já pago</span>
                <span className="font-medium">{formatBRL(conta.valor_pago)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo em aberto</span>
              <span className="font-semibold">{formatBRL(saldo)}</span>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pagar-data">Data do pagamento</Label>
              <Input
                id="pagar-data"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pagar-valor">Valor pago</Label>
              <Input
                id="pagar-valor"
                type="number"
                step="0.01"
                min="0.01"
                max={saldo}
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
            <Label htmlFor="pagar-obs">Observação</Label>
            <Input
              id="pagar-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onConfirmar({
                data_pagamento: dataPagamento,
                valor,
                forma_pagamento: forma,
                observacao,
              })
            }
            disabled={salvando || !dataPagamento || !valor || valor <= 0}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface DialogDespesaProps {
  aberto: boolean
  salvando: boolean
  onOpenChange: (open: boolean) => void
  onConfirmar: (input: {
    fornecedor: string
    descricao: string
    categoria: string
    valor: number
    vencimento: string
    observacoes: string
  }) => void
}

export function DialogNovaDespesa({
  aberto,
  salvando,
  onOpenChange,
  onConfirmar,
}: DialogDespesaProps) {
  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('Aluguel')
  const [categoriaLivre, setCategoriaLivre] = useState('')
  const [valorInput, setValorInput] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const categoriaFinal = categoria === '__livre' ? categoriaLivre.trim() : categoria

  function resetar() {
    setFornecedor('')
    setDescricao('')
    setCategoria('Aluguel')
    setCategoriaLivre('')
    setValorInput('')
    setVencimento('')
    setObservacoes('')
  }

  const valido =
    fornecedor.trim().length > 0 &&
    Number(valorInput.replace(',', '.')) > 0 &&
    vencimento &&
    categoriaFinal.length > 0

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) resetar()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova despesa</DialogTitle>
          <DialogDescription>
            Lançamento avulso de despesa (aluguel, energia, frete etc.).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="desp-fornecedor">Fornecedor / Credor</Label>
            <Input
              id="desp-fornecedor"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              placeholder="Ex.: Imobiliária Central"
            />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_DESPESA.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                <SelectItem value="__livre">Outra (digitar)…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {categoria === '__livre' && (
            <div>
              <Label htmlFor="desp-categoria-livre">Nova categoria</Label>
              <Input
                id="desp-categoria-livre"
                value={categoriaLivre}
                onChange={(e) => setCategoriaLivre(e.target.value)}
                placeholder="Digite a categoria"
              />
            </div>
          )}
          <div>
            <Label htmlFor="desp-valor">Valor</Label>
            <Input
              id="desp-valor"
              type="number"
              step="0.01"
              min="0.01"
              value={valorInput}
              onChange={(e) => setValorInput(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="desp-venc">Vencimento</Label>
            <Input
              id="desp-venc"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="desp-desc">Descrição</Label>
            <Input
              id="desp-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="desp-obs">Observação</Label>
            <Textarea
              id="desp-obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetar()
              onOpenChange(false)
            }}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            disabled={salvando || !valido}
            onClick={() =>
              onConfirmar({
                fornecedor: fornecedor.trim(),
                descricao: descricao.trim(),
                categoria: categoriaFinal,
                valor: Number(valorInput.replace(',', '.')),
                vencimento,
                observacoes: observacoes.trim(),
              })
            }
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lançar despesa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface DialogEditarProps {
  conta: ContaPagar | null
  aberto: boolean
  salvando: boolean
  onOpenChange: (open: boolean) => void
  onConfirmar: (input: {
    fornecedor: string
    descricao: string
    categoria: string
    valor: number
    vencimento: string
    observacoes: string
  }) => void
}

export function DialogEditarConta({
  conta,
  aberto,
  salvando,
  onOpenChange,
  onConfirmar,
}: DialogEditarProps) {
  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [valorInput, setValorInput] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [observacoes, setObservacoes] = useState('')

  useEffect(() => {
    if (conta) {
      setFornecedor(conta.fornecedor)
      setDescricao(conta.descricao || '')
      setCategoria(conta.categoria || CATEGORIAS_DESPESA[0])
      setValorInput(String(conta.valor ?? ''))
      setVencimento((conta.vencimento || '').slice(0, 10))
      setObservacoes(conta.observacoes || '')
    }
  }, [conta])

  if (!conta) return null
  const pago = Number(conta.valor_pago) || 0

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar conta</DialogTitle>
          <DialogDescription>
            {pago > 0
              ? `Esta conta já tem ${formatBRL(pago)} pago — o valor total não pode ficar menor.`
              : 'Altere os dados da conta a pagar.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="edit-fornecedor">Fornecedor / Credor</Label>
            <Input
              id="edit-fornecedor"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-categoria">Categoria</Label>
            <Input
              id="edit-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              list="categorias-despesa"
            />
            <datalist id="categorias-despesa">
              {CATEGORIAS_DESPESA.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="edit-valor">Valor</Label>
            <Input
              id="edit-valor"
              type="number"
              step="0.01"
              min={pago > 0 ? pago : '0.01'}
              value={valorInput}
              onChange={(e) => setValorInput(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-venc">Vencimento</Label>
            <Input
              id="edit-venc"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="edit-desc">Descrição</Label>
            <Input
              id="edit-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="edit-obs">Observação</Label>
            <Textarea
              id="edit-obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            disabled={
              salvando ||
              !fornecedor.trim() ||
              !(Number(valorInput) > 0) ||
              (pago > 0 && Number(valorInput) < pago - 0.005) ||
              !vencimento
            }
            onClick={() =>
              onConfirmar({
                fornecedor: fornecedor.trim(),
                descricao: descricao.trim(),
                categoria: categoria.trim(),
                valor: Number(valorInput),
                vencimento,
                observacoes: observacoes.trim(),
              })
            }
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
