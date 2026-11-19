import pb from '@/lib/pocketbase/client'

/**
 * Documento da PROPOSTA PARA O CLIENTE.
 * Fonte única: hook `proposta_cliente.pb.js`,
 *   GET /backend/v1/custom/propostas/{id}/para-cliente (via pb.send).
 * O hook devolve APENAS campos públicos/venda — nunca custo, margem, markup,
 * NCM/CEST/CFOP/impostos ou fornecedores (mesmo para admin).
 */

export interface ItemDocumentoCliente {
  sku: string
  nome_produto: string
  quantidade: number
  unidade: string
  preco_unitario: number
  desconto_tipo: string
  desconto_valor: number
  preco_liquido: number
  total: number
}

export interface DocumentoCliente {
  /** Nome do cliente gravado na proposta (usado sem cadastro). */
  cliente_fallback: string
  empresa: {
    razao_social: string
    cnpj: string
    endereco: string
    cidade: string
    uf: string
    telefone: string
    email: string
  }
  cliente: {
    razao_social: string
    cnpj: string
    endereco: string
    cidade: string
    uf: string
    contato: string
    telefone: string
    email: string
  } | null
  proposta: {
    numero: string
    data: string
    vendedor: string
    observacoes: string
  }
  condicao_pagamento: string
  prazo_entrega: string
  garantia: string
  contrato_numero: string
  itens: ItemDocumentoCliente[]
  totais: {
    subtotal: number
    total_desconto_itens: number
    total_desconto_geral: number
    valor_total: number
  }
}

export const propostasClienteService = {
  /** Dados completos do documento para o cliente (1 request, rota custom). */
  async getDocumento(propostaId: string): Promise<DocumentoCliente> {
    const idSeguro = encodeURIComponent(propostaId)
    return await pb.send<DocumentoCliente>(
      `/backend/v1/custom/propostas/${idSeguro}/para-cliente`,
      { method: 'GET' },
    )
  },
}
