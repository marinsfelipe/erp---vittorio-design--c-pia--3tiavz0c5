// Fiscal F4 — Helpers de exportação fiscal (pré-nota e livro de saídas).
//
// Puro (sem SheetJS) para poder ser testado e reusado nas duas exportações:
// - detecção de itens "pendente fiscal" (sem NCM) e do texto do bloqueio;
// - regime/CSOSN-CST por item, derivados do regime da Empresa (mesma regra
//   do hook fiscal.pb.js: Simples → CSOSN, Presumido → CST);
// - unidade/origem do NCM por item, quando o cadastro do BOM informa.

import type { Faturamento, FaturamentoItemProduto, OrigemNcm, RegimeTributario } from '@/types/erp'

/** Origem do NCM para a planilha (formato legível). */
export function rotuloOrigemNcm(origem?: OrigemNcm | ''): string {
  if (origem === 'manual') return 'Manual'
  if (origem === 'automatica') return 'Automática (IA)'
  if (origem === 'sugestao') return 'Sugestão'
  return 'Não informada'
}

/**
 * Fiscal F4 — itens do faturamento SEM NCM (pendente fiscal).
 * Usado pelo bloqueio de exportação e pela mensagem ao usuário.
 */
export function itensPendentesFiscais(fat: Faturamento): FaturamentoItemProduto[] {
  return (fat.produtos || []).filter((p) => !(p.ncm || '').trim())
}

/** Texto do bloqueio — lista código/descrição dos itens pendentes. */
export function mensagemPendenciasFiscais(fat: Faturamento): string {
  const pendentes = itensPendentesFiscais(fat)
  if (pendentes.length === 0) return ''
  const lista = pendentes
    .map((p) => `• ${p.sku || 'sem SKU'} — ${p.descricao || 'produto sem descrição'}`)
    .join('\n')
  return (
    `Exportação bloqueada: ${pendentes.length} item(ns) da pré-nota ${fat.numero} ` +
    `estão PENDENTE(S) FISCAL(IS) — sem NCM cadastrado:\n\n${lista}\n\n` +
    'Cadastre o NCM no produto (BOMs) ou peça a liberação ao administrador.'
  )
}

/** Origem do NCM por item, quando o cadastro do BOM informa (mesma lib do hook). */
export function lerOrigemNcm(boms: Array<{ sku: string; ncm_origem?: string }>) {
  const mapa = new Map<string, OrigemNcm | ''>()
  for (const b of boms || []) {
    if (b && b.sku) mapa.set(String(b.sku), (b.ncm_origem as OrigemNcm | '') || '')
  }
  return mapa
}

/**
 * CSOSN (Simples Nacional) ou CST (Lucro Presumido/Real) por item.
 * Mesma regra do hook fiscal.pb.js: regime vem da Empresa.
 */
export function csosnOuCstPorRegime(regime: RegimeTributario | '' | undefined): {
  chave: 'CSOSN' | 'CST'
  valor: string
} {
  if (regime === 'presumido' || regime === 'real') {
    return { chave: 'CST', valor: '40 - Isenta (estimativa)' }
  }
  // Simples Nacional (padrão quando o regime não está configurado)
  return { chave: 'CSOSN', valor: '102 - Sem substituição tributária (estimativa)' }
}

/**
 * Dados do emissor (Empresa) para a aba "Dados Fiscais" da pré-nota.
 * Fonte: coleção `empresa` (1 registro, admin-only) — F1.
 */
export function linhasEmissor(empresa: {
  razao_social?: string
  cnpj?: string
  ie?: string
  endereco?: string
  cidade?: string
  uf?: string
  email?: string
  telefone?: string
  regime?: RegimeTributario | ''
}): Array<{ Campo: string; Valor: string }> {
  const regimeTexto =
    empresa.regime === 'presumido'
      ? 'Lucro Presumido'
      : empresa.regime === 'real'
        ? 'Lucro Real'
        : 'Simples Nacional'
  return [
    { Campo: 'EMISSOR — Razão Social', Valor: empresa.razao_social || 'Não configurado' },
    { Campo: 'EMISSOR — CNPJ', Valor: empresa.cnpj || '—' },
    { Campo: 'EMISSOR — Inscrição Estadual', Valor: empresa.ie || '—' },
    { Campo: 'EMISSOR — Endereço', Valor: empresa.endereco || '—' },
    {
      Campo: 'EMISSOR — Cidade/UF',
      Valor: [empresa.cidade, empresa.uf].filter(Boolean).join(' - ') || '—',
    },
    { Campo: 'EMISSOR — E-mail', Valor: empresa.email || '—' },
    { Campo: 'EMISSOR — Telefone', Valor: empresa.telefone || '—' },
    { Campo: 'EMISSOR — Regime Tributário', Valor: regimeTexto },
  ]
}
