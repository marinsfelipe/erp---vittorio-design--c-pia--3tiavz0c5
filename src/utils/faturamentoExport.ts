import * as XLSX from 'xlsx'
import type { Empresa, Faturamento, OrigemNcm } from '@/types/erp'
import {
  csosnOuCstPorRegime,
  itensPendentesFiscais,
  linhasEmissor,
  mensagemPendenciasFiscais,
  rotuloOrigemNcm,
} from '@/utils/fiscalExportacao'
/**
 * Fiscal F4 — Exportações .xlsx para o escritório contábil.
 * - Pré-nota: dados do EMISSOR (Empresa), dados fiscais do cliente e por item
 *   NCM/origem/CSOSN-CST/unidade/CFOP/CEST + impostos estimados (aba própria).
 * - Livro de Saídas mensal: mesmas colunas fiscais, com impostos estimados.
 * O sistema NÃO emite NF-e — só organiza os dados para o contador emitir.
 */

/** Sanitiza texto para uso em nomes de arquivo */
function sanitizeFilename(text: string): string {
  return text.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_')
}

/** Erro de bloqueio fiscal — carrega a lista de itens pendentes. */
export class ErroPendenciaFiscal extends Error {
  itens: string[]
  constructor(itens: string[]) {
    super('PENDENCIA_FISCAL')
    this.name = 'ErroPendenciaFiscal'
    this.itens = itens
  }
}

/** Opções da exportação da pré-nota (F4). */
export interface OptsPreNota {
  /** Cadastro da Empresa (emissor) — coleção `empresa`, 1 registro. */
  empresa: Empresa | null
  /** Unidade por SKU (do cadastro do BOM, via hook fiscal). */
  unidadePorSku?: Record<string, string>
  /** Origem do NCM por SKU (manual/automatica/sugestao, via hook fiscal). */
  origemPorSku?: Record<string, OrigemNcm | ''>
  /** Admin liberou a exportação mesmo com item pendente fiscal. */
  liberarPendencias: boolean
}

/**
 * Fiscal F4 — monta e baixa a planilha da PRÉ-NOTA com todas as colunas
 * fiscais. Bloqueia (ErroPendenciaFiscal) quando algum item está sem NCM e
 * `liberarPendencias` não veio do admin.
 */
export function exportarPreNotaXlsx(fat: Faturamento, opts: OptsPreNota) {
  // ---------- Bloqueio: item "pendente fiscal" (sem NCM) ----------
  const pendentes = itensPendentesFiscais(fat)
  const temPendencias = pendentes.length > 0
  if (temPendencias && !opts.liberarPendencias) {
    throw new ErroPendenciaFiscal(
      pendentes.map((p) => `${p.sku || 'sem SKU'} — ${p.descricao || 'sem descrição'}`),
    )
  }

  const wb = XLSX.utils.book_new()
  const csosn = csosnOuCstPorRegime(opts.empresa?.regime)
  const regimeTexto =
    opts.empresa?.regime === 'presumido'
      ? 'Lucro Presumido'
      : opts.empresa?.regime === 'real'
        ? 'Lucro Real'
        : 'Simples Nacional'

  // ---------- 1. Aba "Dados Fiscais" (emissor + cliente + totais) ----------
  const dadosFiscais: Array<{ Campo: string; Valor: string | number }> = [
    ...linhasEmissor(opts.empresa || {}),
    { Campo: '—', Valor: '' },
    { Campo: 'Número da Pré-Nota / Faturamento', Valor: fat.numero },
    { Campo: 'Status', Valor: fat.status === 'emitido' ? 'EMITIDO' : 'PENDENTE' },
    {
      Campo: 'Data de Emissão da NF',
      Valor: fat.nf_data_emissao || fat.data_emissao || 'Pendente',
    },
    {
      Campo: 'NF lançada (nº/série)',
      Valor: fat.nf_numero
        ? `${fat.nf_numero}${fat.nf_serie ? '/' + fat.nf_serie : ''}`
        : 'Não lançada',
    },
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
    { Campo: 'CFOP', Valor: fat.cfop || '—' },
    { Campo: 'Regime / CSOSN-CST aplicado', Valor: `${csosn.chave} ${csosn.valor}` },
    { Campo: 'Valor Total Faturado (R$)', Valor: fat.valor_total || 0 },
    {
      Campo: 'Impostos Estimados (R$)',
      Valor: Number((Number(fat.impostos_estimados) || 0).toFixed(2)),
    },
    {
      Campo: 'Valor Líquido Estimado (R$)',
      Valor: Number((Number(fat.valor_liquido) || 0).toFixed(2)),
    },
    { Campo: 'Observações Fiscais', Valor: fat.observacoes || 'Nenhuma' },
  ]
  if (temPendencias) {
    dadosFiscais.push(
      { Campo: '—', Valor: '' },
      {
        Campo: 'ATENÇÃO — PENDÊNCIAS FISCAIS (LIBERADAS PELO ADMIN)',
        Valor: pendentes
          .map((p) => `${p.sku || 'sem SKU'} — ${p.descricao || 'sem descrição'}`)
          .join('; '),
      },
    )
  }

  const wsDados = XLSX.utils.json_to_sheet(dadosFiscais)
  wsDados['!cols'] = [{ wch: 46 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, wsDados, 'Dados Fiscais')

  // ---------- 2. Aba "Itens para NF" — todas as colunas fiscais ----------
  const itens = (fat.produtos || []).map((prod, idx) => ({
    Item: idx + 1,
    'Código / SKU': prod.sku || '—',
    'Descrição do Produto / Equipamento': prod.descricao,
    NCM: (prod.ncm || '').trim(),
    'Origem do NCM': rotuloOrigemNcm(opts.origemPorSku?.[prod.sku || '']),
    [csosn.chave]: csosn.valor,
    Unidade: opts.unidadePorSku?.[prod.sku || ''] || 'UN',
    Quantidade: prod.quantidade,
    'Valor Unitário de Venda (R$)': Number((Number(prod.valor_unitario) || 0).toFixed(2)),
    'Valor Total do Item (R$)': Number((Number(prod.valor_total) || 0).toFixed(2)),
    ...(fat.cfop ? { CFOP: fat.cfop } : {}),
    ...(prod.cest ? { CEST: prod.cest } : {}),
  }))
  const wsItens = XLSX.utils.json_to_sheet(itens)
  wsItens['!cols'] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 45 },
    { wch: 14 },
    { wch: 18 },
    { wch: 38 },
    { wch: 9 },
    { wch: 11 },
    { wch: 25 },
    { wch: 25 },
    { wch: 8 },
    { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, wsItens, 'Itens para NF')

  // ---------- 3. Aba "Impostos Estimados" (impostos_detalhe do hook F1) ----
  let detalhe: Record<string, unknown> = {}
  try {
    detalhe = fat.impostos_detalhe ? JSON.parse(fat.impostos_detalhe) : {}
  } catch {
    detalhe = {}
  }
  const detalheLinhas = Object.entries(detalhe).map(([k, v]) => ({
    Indicador: k,
    Valor: typeof v === 'number' ? Number((v as number).toFixed(2)) : String(v),
  }))
  const wsImpostos = XLSX.utils.json_to_sheet([
    { Indicador: 'Regime', Valor: regimeTexto },
    { Indicador: 'Valor Total (R$)', Valor: Number((Number(fat.valor_total) || 0).toFixed(2)) },
    {
      Indicador: 'Impostos Estimados (R$)',
      Valor: Number((Number(fat.impostos_estimados) || 0).toFixed(2)),
    },
    {
      Indicador: 'Valor Líquido Estimado (R$)',
      Valor: Number((Number(fat.valor_liquido) || 0).toFixed(2)),
    },
    ...(detalheLinhas.length > 0 ? [{ Indicador: '—', Valor: '' }] : []),
    ...detalheLinhas,
    { Indicador: '', Valor: '' },
    {
      Indicador: 'NOTA',
      Valor:
        'ESTIMATIVA gerada pelo ERP — apuração oficial pelo escritório contábil. O sistema NÃO emite NF-e.',
    },
  ])
  wsImpostos['!cols'] = [{ wch: 32 }, { wch: 28 }]
  XLSX.utils.book_append_sheet(wb, wsImpostos, 'Impostos Estimados')

  const filename = `Pre_Nota_${sanitizeFilename(fat.numero)}_${sanitizeFilename(fat.cliente_razao_social)}.xlsx`
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
    CFOP: fat.cfop || '—',
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
        ...(fat.cfop ? { CFOP: fat.cfop } : {}),
        ...(p.ncm ? { NCM: p.ncm } : {}),
        ...(p.cest ? { CEST: p.cest } : {}),
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
