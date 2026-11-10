import { formatBRL } from '@/utils/formatters'
import { valorPorExtenso } from '@/utils/numeroExtenso'
import type { Proposta, PropostaItem, Cliente } from '@/types/erp'

export interface VariaveisContrato {
  cliente: string
  cnpj: string
  endereco: string
  produto: string
  quantidade: string
  valor_total: string
  valor_extenso: string
  prazo_entrega: string
  condicao_pagamento: string
  garantia: string
}

export const CAMPOS_VARIAVEIS_DISPONIVEIS: { tag: string; descricao: string; exemplo: string }[] = [
  {
    tag: '{{cliente}}',
    descricao: 'Razão social ou nome do cliente',
    exemplo: 'Supermercado Central Ltda',
  },
  { tag: '{{cnpj}}', descricao: 'CNPJ do cliente com pontuação', exemplo: '12.345.678/0001-90' },
  {
    tag: '{{endereco}}',
    descricao: 'Endereço completo (logradouro, cidade, UF)',
    exemplo: 'Av. Brasil, 1500, Joinville/SC',
  },
  {
    tag: '{{produto}}',
    descricao: 'Descrição consolidada ou lista de SKUs e produtos',
    exemplo: '1x Balcão Expositor 2m; 2x Câmara Frigorífica',
  },
  {
    tag: '{{quantidade}}',
    descricao: 'Soma total de unidades dos produtos contratados',
    exemplo: '3',
  },
  {
    tag: '{{valor_total}}',
    descricao: 'Valor total em reais formatado (R$)',
    exemplo: 'R$ 45.800,00',
  },
  {
    tag: '{{valor_extenso}}',
    descricao: 'Valor total por extenso em reais',
    exemplo: 'quarenta e cinco mil e oitocentos reais',
  },
  {
    tag: '{{prazo_entrega}}',
    descricao: 'Prazo estipulado para entrega e montagem',
    exemplo: '30 dias úteis',
  },
  {
    tag: '{{condicao_pagamento}}',
    descricao: 'Condições comerciais de pagamento',
    exemplo: '50% de entrada e 50% na entrega',
  },
  {
    tag: '{{garantia}}',
    descricao: 'Prazo e condições da garantia concedida',
    exemplo: '12 (doze) meses',
  },
]

/**
 * Prepara o mapa de valores a partir da proposta, itens e dados do cliente.
 */
export function extrairVariaveisProposta(params: {
  proposta: Proposta
  itens: PropostaItem[]
  cliente?: Cliente | null
  prazoEntregaPadrao?: string
  condicaoPagamentoPadrao?: string
  garantiaPadrao?: string
}): VariaveisContrato {
  const {
    proposta,
    itens,
    cliente,
    prazoEntregaPadrao = '30 (trinta) dias úteis',
    condicaoPagamentoPadrao = '40% de sinal e saldo em 3x sem juros',
    garantiaPadrao = '12 (doze) meses contra defeitos de fabricação',
  } = params

  const clienteNome = cliente?.razao_social || proposta.cliente || 'Cliente não identificado'
  const clienteCnpj = cliente?.cnpj || 'Não informado'

  const enderecoPartes: string[] = []
  if (cliente?.endereco) enderecoPartes.push(cliente.endereco)
  if (cliente?.cidade) enderecoPartes.push(cliente.cidade)
  if (cliente?.uf) enderecoPartes.push(cliente.uf)
  const clienteEndereco =
    enderecoPartes.length > 0 ? enderecoPartes.join(' - ') : 'Endereço comercial a confirmar'

  // Consolidação dos produtos
  let listaProdutos = ''
  let quantidadeTotal = 0

  if (itens && itens.length > 0) {
    listaProdutos = itens
      .map((it) => {
        // Se houver desconto no item, utiliza preco_liquido gravado ou calcula o preço unitário líquido
        let precoEfetivo = Number(it.preco_liquido ?? it.preco_unitario ?? 0)
        if (!it.preco_liquido && it.desconto_tipo && Number(it.desconto_valor || 0) > 0) {
          const valorDesc = Number(it.desconto_valor || 0)
          const base = Number(it.preco_unitario || 0)
          if (it.desconto_tipo === 'percentual') {
            precoEfetivo = Math.max(0, base * (1 - valorDesc / 100))
          } else if (it.desconto_tipo === 'valor') {
            precoEfetivo = Math.max(0, base - valorDesc)
          }
        }
        return `- ${it.quantidade}x ${it.nome_produto} (${it.sku}): ${formatBRL(precoEfetivo)} un.`
      })
      .join('\n')
    quantidadeTotal = itens.reduce((acc, it) => acc + (it.quantidade || 0), 0)
  } else {
    listaProdutos =
      'Equipamentos de refrigeração conforme especificação técnica da proposta comercial.'
    quantidadeTotal = 1
  }

  const valorNum = proposta.valor_total || 0
  const valorTotalFormatado = formatBRL(valorNum)
  const extenso = valorPorExtenso(valorNum)

  return {
    cliente: clienteNome,
    cnpj: clienteCnpj,
    endereco: clienteEndereco,
    produto: listaProdutos,
    quantidade: String(quantidadeTotal),
    valor_total: valorTotalFormatado,
    valor_extenso: extenso,
    prazo_entrega: prazoEntregaPadrao,
    condicao_pagamento: condicaoPagamentoPadrao,
    garantia: garantiaPadrao,
  }
}

/**
 * Substitui todas as variáveis no modelo pelo texto preenchido.
 */
export function preencherModeloContrato(modeloTexto: string, variaveis: VariaveisContrato): string {
  let texto = modeloTexto

  // Substituição case-insensitive de cada tag
  const mapa: Record<string, string> = {
    '{{cliente}}': variaveis.cliente,
    '{{cnpj}}': variaveis.cnpj,
    '{{endereco}}': variaveis.endereco,
    '{{produto}}': variaveis.produto,
    '{{quantidade}}': variaveis.quantidade,
    '{{valor_total}}': variaveis.valor_total,
    '{{valor_extenso}}': variaveis.valor_extenso,
    '{{prazo_entrega}}': variaveis.prazo_entrega,
    '{{condicao_pagamento}}': variaveis.condicao_pagamento,
    '{{garantia}}': variaveis.garantia,
  }

  for (const [tag, valor] of Object.entries(mapa)) {
    // Substitui globalmente a tag
    const regex = new RegExp(tag.replace(/[{}]/g, '\\$&'), 'gi')
    texto = texto.replace(regex, valor || '')
  }

  return texto
}
