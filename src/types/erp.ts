export type TipoItemBom =
  | 'produto_final'
  | 'produto_semi_acabado'
  | 'componente_interno'
  | 'componente_terceiros'

export const TIPOS_ITEM_BOM: { value: TipoItemBom; label: string }[] = [
  { value: 'produto_final', label: 'Produto Final' },
  { value: 'produto_semi_acabado', label: 'Produto Semi-Acabado' },
  { value: 'componente_interno', label: 'Componente Interno' },
  { value: 'componente_terceiros', label: 'Componente de Terceiros' },
]

export const labelTipoItem = (t?: string) => TIPOS_ITEM_BOM.find((x) => x.value === t)?.label ?? '—'

/** Aceita filhos: qualquer tipo exceto componente de terceiros (folha). */
export const aceitaFilhos = (tipo?: string) => tipo !== 'componente_terceiros'

export interface Componente {
  id: string
  codigo: string
  descricao: string
  categoria: string
  unidade: string
  custo_unitario: number
  fornecedor: string
  tipo?: TipoItemBom
  created?: string
  updated?: string
}

export interface Parametro {
  id: string
  chave: string
  nome: string
  valor_percentual: number
  descricao?: string
  ordem?: number
  created?: string
  updated?: string
}

export type OrigemPrecoTabela = 'calculado' | 'sobrepreco' | 'manual' | 'preco_direto'
export type TipoSobrepreco = 'nenhum' | 'percentual' | 'valor'

export interface Bom {
  id: string
  sku: string
  nome: string
  descricao?: string
  categoria?: string
  overhead_percentual?: number
  margem_percentual?: number
  preco_direto?: boolean
  preco_venda?: number
  unidade?: string
  origem_preco?: OrigemPrecoTabela
  sobrepreco_tipo?: TipoSobrepreco
  sobrepreco_valor?: number
  preco_final_tabela?: number
  created?: string
  updated?: string
}

export interface BomItem {
  id: string
  bom_id: string
  componente_id?: string
  nivel: number
  ordem: number
  codigo: string
  descricao: string
  categoria?: string
  unidade: string
  quantidade: number
  custo_unitario: number
  fornecedor?: string
  tipo_linha?: 'componente' | 'submontagem' | string
  parent_id?: string
  item_tipo?: TipoItemBom
  created?: string
  updated?: string
}

export type PropostaStatus =
  | 'rascunho'
  | 'enviada'
  | 'em_negociacao'
  | 'vendida'
  | 'perdida'
  | 'aguardando_aprovacao'

export type DescontoTipo = 'valor' | 'percentual'

export interface Proposta {
  id: string
  numero: string
  cliente: string
  status: PropostaStatus
  valor_total: number
  observacoes: string
  criador?: string
  motivo_perda?: string
  // Desconto geral e subtotal
  subtotal?: number
  desconto_tipo?: DescontoTipo
  desconto_valor?: number
  total_desconto_itens?: number
  total_desconto_geral?: number
  desconto_aplicado_por?: string
  desconto_aplicado_em?: string
  status_anterior_aprovacao?: PropostaStatus
  expand?: {
    criador?: {
      id: string
      name?: string
      email?: string
    }
    desconto_aplicado_por?: {
      id: string
      name?: string
      email?: string
    }
  }
  created?: string
  updated?: string
}

export type PerfilUsuario = 'admin' | 'usuario' | 'vendedor'

export interface Cliente {
  id: string
  razao_social: string
  cnpj?: string
  endereco?: string
  cidade?: string
  uf?: string
  contato?: string
  email?: string
  telefone?: string
  criador: string
  expand?: { criador?: { id: string; name?: string; email?: string } }
  created?: string
  updated?: string
}

export interface ClienteInput {
  razao_social: string
  cnpj?: string
  endereco?: string
  cidade?: string
  uf?: string
  contato?: string
  email?: string
  telefone?: string
  criador: string
}

export interface PropostaItem {
  id: string
  proposta_id: string
  bom_id?: string
  sku: string
  nome_produto: string
  quantidade: number
  preco_unitario: number
  custo_unitario: number
  preco_direto?: boolean
  unidade?: string
  // Desconto por item
  desconto_tipo?: DescontoTipo
  desconto_valor?: number
  preco_liquido?: number
  total_desconto?: number
  desconto_aplicado_por?: string
  desconto_aplicado_em?: string
  // Preço editável e histórico
  preco_original_tabela?: number
  preco_editado?: boolean
  preco_editado_por?: string
  preco_editado_em?: string
  expand?: {
    desconto_aplicado_por?: {
      id: string
      name?: string
      email?: string
    }
    preco_editado_por?: {
      id: string
      name?: string
      email?: string
    }
  }
  created?: string
  updated?: string
}

export interface PropostaPrecoAuditoria {
  id: string
  proposta: string
  item: string
  item_sku?: string
  item_nome?: string
  preco_anterior: number
  preco_novo: number
  preco_original_tabela?: number
  usuario: string
  usuario_nome?: string
  usuario_email?: string
  justificativa?: string
  created?: string
  updated?: string
  expand?: {
    usuario?: {
      id: string
      name?: string
      email?: string
    }
    proposta?: {
      id: string
      numero?: string
    }
    item?: PropostaItem
  }
}

export interface PropostaDescontoAuditoria {
  id: string
  proposta: string
  item?: string
  tipo_alvo: 'item' | 'geral'
  item_sku?: string
  item_nome?: string
  desconto_tipo: DescontoTipo
  desconto_valor_informado: number
  desconto_valor_total: number
  valor_base_anterior?: number
  valor_final_resultante?: number
  usuario: string
  usuario_nome?: string
  usuario_email?: string
  observacao?: string
  created?: string
  updated?: string
  expand?: {
    usuario?: {
      id: string
      name?: string
      email?: string
    }
    proposta?: {
      id: string
      numero?: string
    }
  }
}

export type OrdemCompraStatus = 'pendente' | 'parcial' | 'concluida'

export interface OrdemCompra {
  id: string
  numero: string
  status: OrdemCompraStatus
  custo_total: number
  proposta_id: string
  created?: string
  updated?: string
}

export interface OrdemCompraItem {
  id: string
  ordem_id: string
  codigo: string
  descricao: string
  categoria: string
  unidade: string
  fornecedor: string
  quantidade: number
  custo_unitario: number
  custo_total: number
  comprado: boolean
  created?: string
  updated?: string
}

export interface AuthUser {
  id: string
  email: string
  name?: string
  avatar?: string
  perfil?: PerfilUsuario
  status?: 'pendente' | 'aprovado' | 'bloqueado'
}

export interface UsuarioPerfil {
  id: string
  user: string
  nome: string
  email?: string
  perfil: PerfilUsuario
  status: 'pendente' | 'aprovado' | 'bloqueado'
  created?: string
  updated?: string
}

export interface ModeloContrato {
  id: string
  titulo: string
  descricao?: string
  conteudo: string
  ativo: boolean
  padrao: boolean
  criador?: string
  created?: string
  updated?: string
}

export interface ModeloContratoInput {
  titulo: string
  descricao?: string
  conteudo: string
  ativo: boolean
  padrao: boolean
  criador?: string
}

export interface Contrato {
  id: string
  numero: string
  ano: number
  sequencial: number
  proposta?: string
  proposta_numero?: string
  cliente?: string
  cliente_nome: string
  cliente_cnpj?: string
  modelo?: string
  modelo_titulo?: string
  conteudo: string
  valor_total?: number
  prazo_entrega?: string
  condicao_pagamento?: string
  garantia?: string
  criador: string
  expand?: {
    proposta?: Proposta
    cliente?: Cliente
    modelo?: ModeloContrato
    criador?: { id: string; name?: string; email?: string }
  }
  created?: string
  updated?: string
}

export interface ContratoInput {
  numero: string
  ano: number
  sequencial: number
  proposta?: string
  proposta_numero?: string
  cliente?: string
  cliente_nome: string
  cliente_cnpj?: string
  modelo?: string
  modelo_titulo?: string
  conteudo: string
  valor_total?: number
  prazo_entrega?: string
  condicao_pagamento?: string
  garantia?: string
  criador: string
}

export type FaturamentoStatus = 'pendente' | 'emitido'

export interface FaturamentoItemProduto {
  descricao: string
  sku?: string
  quantidade: number
  valor_unitario: number
  valor_total: number
}

export interface Faturamento {
  id: string
  numero: string
  ano: number
  sequencial: number
  proposta?: string
  proposta_numero?: string
  cliente?: string
  cliente_razao_social: string
  cliente_cnpj?: string
  cliente_ie?: string
  cliente_endereco?: string
  cliente_cidade?: string
  cliente_uf?: string
  cliente_contato?: string
  cliente_email?: string
  cliente_telefone?: string
  produtos: FaturamentoItemProduto[]
  valor_total: number
  status: FaturamentoStatus
  data_emissao?: string
  observacoes?: string
  criador: string
  expand?: {
    proposta?: Proposta
    cliente?: Cliente
    criador?: { id: string; name?: string; email?: string }
  }
  created?: string
  updated?: string
}

export interface FaturamentoInput {
  numero: string
  ano: number
  sequencial: number
  proposta?: string
  proposta_numero?: string
  cliente?: string
  cliente_razao_social: string
  cliente_cnpj?: string
  cliente_ie?: string
  cliente_endereco?: string
  cliente_cidade?: string
  cliente_uf?: string
  cliente_contato?: string
  cliente_email?: string
  cliente_telefone?: string
  produtos: FaturamentoItemProduto[]
  valor_total: number
  status: FaturamentoStatus
  data_emissao?: string
  observacoes?: string
  criador: string
}
