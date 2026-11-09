import { useState, useEffect } from 'react'
import { modelosContratoService } from '@/services/modelosContrato'
import { contratosService } from '@/services/contratos'
import { clientesService } from '@/services/clientes'
import type { Proposta, PropostaItem, Cliente, ModeloContrato, Contrato } from '@/types/erp'
import {
  extrairVariaveisProposta,
  preencherModeloContrato,
  type VariaveisContrato,
} from '@/utils/contratoVariaveis'
import { imprimirContrato } from '@/utils/contratoPdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  FileSignature,
  Printer,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  Building2,
  Calendar,
  ShieldCheck,
  CreditCard,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'

interface GerarContratoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proposta: Proposta
  itens: PropostaItem[]
  onContratoGerado?: (contrato: Contrato) => void
}

export function GerarContratoDialog({
  open,
  onOpenChange,
  proposta,
  itens,
  onContratoGerado,
}: GerarContratoDialogProps) {
  const [modelos, setModelos] = useState<ModeloContrato[]>([])
  const [modeloSelecionadoId, setModeloSelecionadoId] = useState<string>('')
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [carregandoDados, setCarregandoDados] = useState(false)
  const [gerando, setGerando] = useState(false)

  // Variáveis editáveis antes da geração final
  const [prazoEntrega, setPrazoEntrega] = useState('30 (trinta) dias úteis')
  const [condicaoPagamento, setCondicaoPagamento] = useState('40% de sinal e saldo na entrega')
  const [garantia, setGarantia] = useState('12 (doze) meses contra defeitos de fabricação')

  // Preview do contrato preenchido e editável
  const [conteudoPreenchido, setConteudoPreenchido] = useState('')
  const [numeroPrevisto, setNumeroPrevisto] = useState('')
  const [anoPrevisto, setAnoPrevisto] = useState(new Date().getFullYear())
  const [seqPrevisto, setSeqPrevisto] = useState(1)

  // Carrega modelos e dados do cliente ao abrir
  useEffect(() => {
    if (!open) return

    let cancelado = false
    async function carregar() {
      setCarregandoDados(true)
      try {
        // 1. Modelos de contrato ativos
        const mods = await modelosContratoService.getAtivos()
        if (cancelado) return
        setModelos(mods)

        const padrao = mods.find((m) => m.padrao) || mods[0]
        if (padrao) {
          setModeloSelecionadoId(padrao.id)
        }

        // 2. Tenta encontrar o cadastro do cliente pelo nome para obter CNPJ e endereço
        try {
          const todosClientes = await clientesService.getAll()
          if (!cancelado) {
            const encontrado = todosClientes.find(
              (c) =>
                c.razao_social.trim().toLowerCase() ===
                (proposta.cliente || '').trim().toLowerCase(),
            )
            setCliente(encontrado || null)
          }
        } catch (e) {
          console.warn('Não foi possível carregar cliente relacionado:', e)
        }

        // 3. Obtém o próximo número sequencial CT-AAAA-NNNN
        const prox = await contratosService.getProximoNumero()
        if (!cancelado) {
          setNumeroPrevisto(prox.numero)
          setAnoPrevisto(prox.ano)
          setSeqPrevisto(prox.sequencial)
        }
      } catch (err) {
        console.error(err)
        toast.error('Erro ao preparar geração de contrato.')
      } finally {
        if (!cancelado) setCarregandoDados(false)
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [open, proposta])

  // Recalcula o preview sempre que o modelo selecionado ou os campos variáveis mudarem
  useEffect(() => {
    if (!modeloSelecionadoId) return
    const mod = modelos.find((m) => m.id === modeloSelecionadoId)
    if (!mod) return

    const variaveis = extrairVariaveisProposta({
      proposta,
      itens,
      cliente,
      prazoEntregaPadrao: prazoEntrega,
      condicaoPagamentoPadrao: condicaoPagamento,
      garantiaPadrao: garantia,
    })

    const texto = preencherModeloContrato(mod.conteudo, variaveis)
    setConteudoPreenchido(texto)
  }, [
    modeloSelecionadoId,
    modelos,
    proposta,
    itens,
    cliente,
    prazoEntrega,
    condicaoPagamento,
    garantia,
  ])

  const handleSalvarEImprimir = async () => {
    if (!conteudoPreenchido.trim()) {
      toast.error('O conteúdo do contrato não pode estar vazio.')
      return
    }

    setGerando(true)
    try {
      const modeloObj = modelos.find((m) => m.id === modeloSelecionadoId)

      // Grava o contrato gerado no histórico
      const novoContrato = await contratosService.create({
        numero: numeroPrevisto,
        ano: anoPrevisto,
        sequencial: seqPrevisto,
        proposta: proposta.id,
        proposta_numero: proposta.numero,
        cliente: cliente?.id,
        cliente_nome: cliente?.razao_social || proposta.cliente || 'Cliente',
        cliente_cnpj: cliente?.cnpj || undefined,
        modelo: modeloSelecionadoId || undefined,
        modelo_titulo: modeloObj?.titulo || 'Modelo Padrão',
        conteudo: conteudoPreenchido,
        valor_total: proposta.valor_total || 0,
        prazo_entrega: prazoEntrega,
        condicao_pagamento: condicaoPagamento,
        garantia: garantia,
      })

      toast.success(`Contrato ${novoContrato.numero} gerado com sucesso!`)

      // Abre janela de impressão / PDF
      imprimirContrato({
        numero: novoContrato.numero,
        cliente: novoContrato.cliente_nome,
        cnpj: novoContrato.cliente_cnpj,
        conteudo: novoContrato.conteudo,
      })

      if (onContratoGerado) {
        onContratoGerado(novoContrato)
      }

      onOpenChange(false)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao salvar e emitir contrato.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSignature className="h-6 w-6 text-primary" />
              <DialogTitle className="text-xl">Gerar Contrato de Venda</DialogTitle>
            </div>
            {numeroPrevisto && (
              <Badge
                variant="outline"
                className="font-mono text-xs font-bold text-primary border-primary/40"
              >
                Nº {numeroPrevisto}
              </Badge>
            )}
          </div>
          <DialogDescription>
            Preenchimento automático do contrato com os dados da Proposta{' '}
            <strong className="text-foreground">{proposta.numero}</strong> e do cliente{' '}
            <strong className="text-foreground">{proposta.cliente}</strong>.
          </DialogDescription>
        </DialogHeader>

        {carregandoDados ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Carregando modelos de contrato e dados cadastrais...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Escolha do Modelo e Identificação do Cliente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-lg bg-muted/20 border border-border">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Modelo de Contrato *</Label>
                {modelos.length === 0 ? (
                  <p className="text-xs text-rose-600">
                    Nenhum modelo de contrato ativo encontrado. Peça ao administrador para cadastrar
                    em Modelos de Contrato.
                  </p>
                ) : (
                  <Select value={modeloSelecionadoId} onValueChange={setModeloSelecionadoId}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Selecione um modelo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {modelos.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          {m.titulo} {m.padrao ? '(Padrão)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold block">Dados do Cliente Vinculado</span>
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    {cliente?.razao_social || proposta.cliente}
                  </p>
                  <p className="font-mono text-[11px] mt-0.5">
                    CNPJ:{' '}
                    {cliente?.cnpj ||
                      'Não cadastrado no módulo de clientes (preencha no texto se desejar)'}
                  </p>
                </div>
              </div>
            </div>

            {/* Ajuste de variáveis antes de gerar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="space-y-1">
                <Label
                  htmlFor="prazo"
                  className="text-[11px] font-semibold flex items-center gap-1 text-primary"
                >
                  <Truck className="h-3.5 w-3.5" />
                  Prazo de Entrega
                </Label>
                <Input
                  id="prazo"
                  value={prazoEntrega}
                  onChange={(e) => setPrazoEntrega(e.target.value)}
                  className="text-xs bg-background"
                  placeholder="Ex: 30 dias úteis"
                />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="pagamento"
                  className="text-[11px] font-semibold flex items-center gap-1 text-primary"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Condição de Pagamento
                </Label>
                <Input
                  id="pagamento"
                  value={condicaoPagamento}
                  onChange={(e) => setCondicaoPagamento(e.target.value)}
                  className="text-xs bg-background"
                  placeholder="Ex: 50% sinal e 50% na entrega"
                />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="garantia"
                  className="text-[11px] font-semibold flex items-center gap-1 text-primary"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Garantia
                </Label>
                <Input
                  id="garantia"
                  value={garantia}
                  onChange={(e) => setGarantia(e.target.value)}
                  className="text-xs bg-background"
                  placeholder="Ex: 12 meses"
                />
              </div>
            </div>

            {/* Editor / Preview do Contrato */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="preenchido"
                  className="text-xs font-semibold flex items-center gap-1.5"
                >
                  <FileText className="h-4 w-4 text-primary" />
                  <span>Texto do Contrato (Preview Final Editável)</span>
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Você pode fazer ajustes finais no texto antes de imprimir ou salvar
                </span>
              </div>
              <Textarea
                id="preenchido"
                rows={14}
                value={conteudoPreenchido}
                onChange={(e) => setConteudoPreenchido(e.target.value)}
                className="font-serif text-xs leading-relaxed"
                placeholder="O texto do contrato preenchido aparecerá aqui..."
              />
            </div>
          </div>
        )}

        <DialogFooter className="pt-3 border-t border-border flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={gerando}
          >
            Cancelar
          </Button>

          <Button
            type="button"
            onClick={handleSalvarEImprimir}
            disabled={gerando || carregandoDados || !conteudoPreenchido.trim()}
            className="gap-2 shadow-sm"
          >
            <Printer className="h-4 w-4" />
            {gerando ? 'Gerando...' : 'Salvar e Gerar PDF / Imprimir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
