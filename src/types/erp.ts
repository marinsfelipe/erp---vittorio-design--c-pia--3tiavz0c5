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

export interface Bom {
  id: string
  sku: string
  nome: string
  descricao?: string
  categoria?: string
  overhead_percentual?: number
  margem_percentual?: number
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

export type PropostaStatus = 'rascunho' | 'enviada' | 'vendida'

export interface Proposta {
  id: string
  numero: string
  cliente: string
  status: PropostaStatus
  valor_total: number
  observacoes: string
  created?: string
  updated?: string
}

export interface PropostaItem {
  id: string
  proposta_id: string
  bom_id: string
  sku: string
  nome_produto: string
  quantidade: number
  preco_unitario: number
  custo_unitario: number
  created?: string
  updated?: string
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
}
