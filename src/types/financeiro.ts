// Tipos e labels do Módulo Financeiro — Contas a Receber (admin-only)

export type StatusParcela = 'pendente' | 'pago' | 'parcial' | 'cancelado'

export type FormaPagamento =
  | 'pix'
  | 'boleto'
  | 'transferencia'
  | 'dinheiro'
  | 'cartao'
  | 'cheque'
  | 'outro'

export const LABEL_FORMA_PAGAMENTO: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
  cartao: 'Cheque',
  cheque: 'Cheque',
  outro: 'Outro',
}

export interface CondicaoPagamento {
  id: string
  chave: string
  nome: string
  /** Prazo em dias do vencimento da parcela (0 = à vista) */
  dias: number
  descricao?: string
  created?: string
  updated?: string
}

export interface ContaReceber {
  id: string
  faturamento: string
  proposta?: string
  cliente?: string
  faturamento_numero: string
  proposta_numero?: string
  cliente_nome: string
  cliente_cnpj?: string
  condicao_pagamento?: string
  numero_parcela: number
  total_parcelas: number
  valor_parcela: number
  valor_recebido: number
  vencimento: string
  status: StatusParcela
  data_recebimento?: string
  forma_pagamento?: string
  observacoes?: string
  criador: string
  created?: string
  updated?: string
}

export interface BaixaParcelaInput {
  data_pagamento: string
  valor: number
  forma_pagamento?: FormaPagamento
  observacao?: string
}

/** Status efetivo considerando o atraso pela data de vencimento */
export function statusEfetivo(
  conta: Pick<ContaReceber, 'status' | 'vencimento' | 'valor_parcela' | 'valor_recebido'>,
): StatusParcela | 'atrasado' {
  if (conta.status === 'cancelado') return 'cancelado'
  if (conta.status === 'pago') return 'pago'
  const venc = new Date(conta.vencimento)
  const hoje = new Date()
  venc.setHours(0, 0, 0, 0)
  hoje.setHours(0, 0, 0, 0)
  if (venc < hoje) return 'atrasado'
  return conta.status === 'parcial' ? 'parcial' : 'pendente'
}

export const LABEL_STATUS_PARCELA: Record<string, string> = {
  pendente: 'Pendente',
  parcial: 'Pago parcial',
  pago: 'Pago',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
}

/** Saldo em aberto da parcela (o que falta receber) */
export function saldoAberto(conta: ContaReceber): number {
  return Math.max(0, (Number(conta.valor_parcela) || 0) - (Number(conta.valor_recebido) || 0))
}

// ---------------------------------------------------------------------------
// Contas a Pagar (Funcionalidade 2) — mesmos padrões de ContaReceber
// ---------------------------------------------------------------------------

export interface ContaPagar {
  id: string
  ordem_compra?: string
  ordem_numero?: string
  fornecedor: string
  descricao?: string
  categoria?: string
  valor: number
  valor_pago: number
  vencimento: string
  status: StatusParcela
  data_pagamento?: string
  forma_pagamento?: string
  observacoes?: string
  criado_por: string
  created?: string
  updated?: string
}

export interface BaixaContaPagarInput {
  data_pagamento: string
  valor: number
  forma_pagamento?: FormaPagamento
  observacao?: string
}

/** Categorias sugeridas para lançamento avulso de despesas (campo livre) */
export const CATEGORIAS_DESPESA = [
  'Aluguel',
  'Energia',
  'Água',
  'Telefonia/Internet',
  'Insumos',
  'Frete',
  'Impostos',
  'Outros',
]

/** Status efetivo da conta a pagar, considerando atraso pelo vencimento */
export function statusEfetivoPagar(
  conta: Pick<ContaPagar, 'status' | 'vencimento' | 'valor' | 'valor_pago'>,
): StatusParcela | 'atrasado' {
  if (conta.status === 'cancelado') return 'cancelado'
  if (conta.status === 'pago') return 'pago'
  const venc = new Date(conta.vencimento)
  const hoje = new Date()
  venc.setHours(0, 0, 0, 0)
  hoje.setHours(0, 0, 0, 0)
  if (venc < hoje) return 'atrasado'
  return conta.status === 'parcial' ? 'parcial' : 'pendente'
}

export const LABEL_STATUS_CONTA_PAGAR: Record<string, string> = {
  pendente: 'Pendente',
  parcial: 'Pago parcial',
  pago: 'Pago',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
}

/** Saldo em aberto da conta a pagar (o que falta pagar) */
export function saldoAbertoPagar(conta: ContaPagar): number {
  return Math.max(0, (Number(conta.valor) || 0) - (Number(conta.valor_pago) || 0))
}
