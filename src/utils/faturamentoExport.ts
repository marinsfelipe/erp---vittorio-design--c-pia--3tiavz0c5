import * as XLSX from 'xlsx'
import type { Faturamento } from '@/types/erp'

/**
 * Sanitiza texto para uso em nomes de arquivo
 */
function sanitizeFilename(text: string): string {
  return text.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_')
}

/**
 * Exporta um faturamento individual em planilha .xlsx com dados fiscais do cliente
 * e lista discriminada de produtos/valores de venda (sem custos) para envio à contabilidade.
 */
export function exportarFaturamentoXlsx(fat: Faturamento) {
  const wb = XLSX.utils.book_new()

  // 1. Aba Resumo / Dados Fiscais
  const dadosCadastrais = [
    { Campo: 'Número da Pré-Nota / Faturamento', Valor: fat.numero },
    { Campo: 'Status', Valor: fat.status === 'emitido' ? 'EMITIDO' : 'PENDENTE' },
    { Campo: 'Data de Emissão da NF', Valor: fat.data_emissao || 'Pendente' },
    {
      Campo: 'Data de Geração do Registro',
      Valor: fat.created ? fat.created.substring(0, 10) : '',
    },
    { Campo: 'Proposta Comercial Relacionada', Valor: fat.proposta_numero || '—' },
    { Campo: 'Razão Social / Nome do Cliente', Valor: fat.cliente_razao_social },
    { Campo: 'CNPJ / CPF', Valor: fat.cliente_cnpj || '—' },
    { Campo: 'Inscrição Estadual (IE)', Valor: fat.cliente_ie || 'ISENTO / NÃO INFORMADO' },
    { Campo: 'Endereço Completo', Valor: fat.cliente_endereco || '—' },
    { Campo: 'Cidade', Valor: fat.cliente_cidade || '—' },
    { Campo: 'UF', Valor: fat.cliente_uf || '—' },
    { Campo: 'Contato Responsável', Valor: fat.cliente_contato || '—' },
    { Campo: 'E-mail', Valor: fat.cliente_email || '—' },
    { Campo: 'Telefone', Valor: fat.cliente_telefone || '—' },
    { Campo: 'Valor Total Faturado (R$)', Valor: fat.valor_total || 0 },
    { Campo: 'Observações Fiscais', Valor: fat.observacoes || 'Nenhuma' },
  ]

  const wsDados = XLSX.utils.json_to_sheet(dadosCadastrais)
  wsDados['!cols'] = [{ wch: 35 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, wsDados, 'Dados Fiscais')

  // 2. Aba Itens / Produtos (Apenas preços de venda, NUNCA custos)
  const itens = (fat.produtos || []).map((prod, idx) => ({
    Item: idx + 1,
    'Código / SKU': prod.sku || '—',
    'Descrição do Produto / Equipamento': prod.descricao,
    Quantidade: prod.quantidade,
    'Valor Unitário de Venda (R$)': prod.valor_unitario,
    'Valor Total do Item (R$)': prod.valor_total,
  }))

  const wsItens = XLSX.utils.json_to_sheet(itens)
  wsItens['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 45 }, { wch: 12 }, { wch: 25 }, { wch: 25 }]
  XLSX.utils.book_append_sheet(wb, wsItens, 'Itens para NF')

  const filename = `Faturamento_${sanitizeFilename(fat.numero)}_${sanitizeFilename(fat.cliente_razao_social)}.xlsx`
  XLSX.writeFile(wb, filename)
}

/**
 * Exporta uma lista de faturamentos consolidada em formato .xlsx para o escritório contábil
 */
export function exportarListaFaturamentosXlsx(lista: Faturamento[]) {
  const wb = XLSX.utils.book_new()

  // Lista consolidada de cabeçalho
  const linhasGerais = lista.map((fat) => ({
    'Nº Faturamento': fat.numero,
    Status: fat.status === 'emitido' ? 'Emitido' : 'Pendente',
    'Data Emissão': fat.data_emissao || '—',
    Proposta: fat.proposta_numero || '—',
    'Razão Social': fat.cliente_razao_social,
    CNPJ: fat.cliente_cnpj || '—',
    'Inscrição Estadual': fat.cliente_ie || '—',
    Cidade: fat.cliente_cidade || '—',
    UF: fat.cliente_uf || '—',
    Endereço: fat.cliente_endereco || '—',
    'E-mail': fat.cliente_email || '—',
    Telefone: fat.cliente_telefone || '—',
    'Qtd SKUs': (fat.produtos || []).length,
    'Valor Total (R$)': fat.valor_total || 0,
    Observações: fat.observacoes || '',
  }))

  const wsGeral = XLSX.utils.json_to_sheet(linhasGerais)
  wsGeral['!cols'] = [
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 35 },
    { wch: 20 },
    { wch: 18 },
    { wch: 20 },
    { wch: 6 },
    { wch: 30 },
    { wch: 25 },
    { wch: 16 },
    { wch: 10 },
    { wch: 18 },
    { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(wb, wsGeral, 'Faturamentos')

  // Aba com todos os itens discriminados
  const linhasItens: Array<Record<string, unknown>> = []
  for (const fat of lista) {
    ;(fat.produtos || []).forEach((p, idx) => {
      linhasItens.push({
        'Nº Faturamento': fat.numero,
        Cliente: fat.cliente_razao_social,
        CNPJ: fat.cliente_cnpj || '—',
        Item: idx + 1,
        SKU: p.sku || '—',
        Descrição: p.descricao,
        Quantidade: p.quantidade,
        'Valor Unitário (R$)': p.valor_unitario,
        'Valor Total (R$)': p.valor_total,
      })
    })
  }

  const wsItens = XLSX.utils.json_to_sheet(linhasItens)
  wsItens['!cols'] = [
    { wch: 16 },
    { wch: 30 },
    { wch: 20 },
    { wch: 6 },
    { wch: 16 },
    { wch: 40 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
  ]
  XLSX.utils.book_append_sheet(wb, wsItens, 'Itens Discriminados')

  const dataAtual = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `Relatorio_Faturamentos_Contabilidade_${dataAtual}.xlsx`)
}
