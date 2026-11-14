import * as XLSX from 'xlsx'
import { parseCsvOrTsv } from '@/utils/csvParser'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Uma linha crua da planilha, já mapeada para os campos da tabela de preços. */
export interface LinhaPrecos {
  linha: number // nº da linha na planilha (1 = cabeçalho)
  codigo: string
  descricao: string
  unidade: string
  categoria: string
  precoFinal: number
  temPreco: boolean
  precoBruto: string
  fornecedor: string
  observacao: string
}

export type AcaoMerge = 'criar' | 'atualizar'

export type ProblemaTipo =
  | 'codigo_ausente'
  | 'preco_ausente'
  | 'preco_zero'
  | 'preco_negativo'
  | 'codigo_duplicado'
  | 'preco_invalido'

export interface ProblemaLinha {
  linha: number
  codigo: string
  motivo: string
  tipo: ProblemaTipo
}

/** Decisão de mesclagem para uma linha válida (classificada contra a base). */
export interface DecisaoImportacao {
  linha: LinhaPrecos
  acao: AcaoMerge
  /** SKU já existe na base (produto existente)? */
  produtoExiste: boolean
  /** Produto existente possui BOM com componentes? */
  temBomComponentes: boolean
  /** Um BOM vazio (sem componentes) deve ser criado para este produto? */
  criarBomVazio: boolean
  precoAtual?: number
  origemAtual?: string
}

export interface PreviewImportacaoPrecos {
  linhas: LinhaPrecos[]
  validas: DecisaoImportacao[]
  problemas: ProblemaLinha[]
  novos: DecisaoImportacao[]
  atualizacoes: DecisaoImportacao[]
  totalLinhas: number
}

export interface ResultadoImportacaoPrecos {
  produtosCriados: number
  precosAtualizados: number
  bomsVaziosCriados: number
}

// ---------------------------------------------------------------------------
// Leitura do arquivo (.xlsx / .csv)
// ---------------------------------------------------------------------------

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

function normalizarChaves(row: Record<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    obj[normalizar(k)] = v
  }
  return obj
}

/** Lê um arquivo .xlsx/.xls/.csv e devolve as linhas com chaves normalizadas. */
export async function lerPlanilhaPrecos(file: File): Promise<Record<string, unknown>[]> {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    return rows.map(normalizarChaves)
  }
  // CSV: vírgula, ponto-e-vírgula ou tabulação
  const text = await file.text()
  const { rows, headers } = parseCsvOrTsv(text)
  return rows.map((r) => {
    const obj: Record<string, unknown> = {}
    for (const h of headers) {
      obj[normalizar(h)] = (r as Record<string, string>)[h]
    }
    return obj
  })
}

// ---------------------------------------------------------------------------
// Interpretação e validação (sem acesso à base)
// ---------------------------------------------------------------------------

/**
 * Converte o preço escrito na planilha para número. Aceita os formatos
 * brasileiros ("18.500,00", "18500,00") e o formato com ponto decimal
 * ("18500.00", comum quando a célula já é numérica no Excel).
 */
export const parsePrecoBr = (raw: string | number): number => {
  if (raw === '' || raw === null || raw === undefined) return NaN
  let t = String(raw).replace(/[R$\s]/g, '')
  if (!t) return NaN
  if (t.includes(',') && t.includes('.')) {
    // Tem os dois: o último separador é o decimal
    t =
      t.lastIndexOf(',') > t.lastIndexOf('.')
        ? t.replace(/\./g, '').replace(',', '.')
        : t.replace(/,/g, '')
  } else if (t.includes(',')) {
    const parts = t.split(',')
    const ultima = parts[parts.length - 1]
    // "1,5" → decimal; "1,500" ou "1,500,000" → milhar
    t = parts.length === 2 && ultima.length !== 3 ? t.replace(',', '.') : t.replace(/,/g, '')
  } else if (t.includes('.')) {
    const parts = t.split('.')
    const ultima = parts[parts.length - 1]
    // "1.500" (3 dígitos no fim) ou "1.500.000" → milhar; "18500.00"/"0.5" → decimal
    if (parts.length > 2 || ultima.length === 3) t = t.replace(/\./g, '')
  }
  const n = parseFloat(t)
  return isNaN(n) ? NaN : n
}

/** Mapeia as linhas cruas para LinhaPrecos. */
export function mapearLinhasPrecos(rows: Record<string, unknown>[]): LinhaPrecos[] {
  const out: LinhaPrecos[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const buscar = (...nomes: string[]): string => {
      for (const nome of nomes) {
        const v = row[nome]
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
      }
      return ''
    }

    const codigo = buscar('codigo_produto', 'codigo', 'cod', 'sku', 'code', 'referencia')
    const descricao = buscar('descricao', 'descricao_produto', 'produto', 'nome', 'item')
    const unidade = (buscar('unidade', 'und', 'un', 'unit') || 'UN').toUpperCase()
    const categoria = buscar('categoria', 'category', 'grupo') || 'Geral'
    const precoBruto = buscar(
      'preco_final',
      'preco_final_rs',
      'preco_final_r',
      'preco',
      'valor',
      'preco_venda',
      'price',
    )
    const temPreco = precoBruto !== ''
    const precoFinal = temPreco ? parsePrecoBr(precoBruto) : 0
    const fornecedor = buscar('fornecedor', 'fabricante', 'supplier')
    const observacao = buscar('observacao', 'obs', 'observacoes', 'nota')

    // Linha totalmente vazia: pular silenciosamente
    if (!codigo && !descricao && !temPreco) continue

    out.push({
      linha: i + 2, // linha 1 = cabeçalho
      codigo,
      descricao,
      unidade,
      categoria,
      precoFinal,
      temPreco,
      precoBruto,
      fornecedor,
      observacao,
    })
  }
  return out
}

/** Validações de conteúdo (código ausente, preço ausente/zero/negativo, duplicado). */
export function validarLinhas(linhas: LinhaPrecos[]): ProblemaLinha[] {
  const problemas: ProblemaLinha[] = []
  const codigosVistos = new Map<string, number>()

  for (const l of linhas) {
    if (!l.codigo) {
      problemas.push({
        linha: l.linha,
        codigo: l.codigo,
        tipo: 'codigo_ausente',
        motivo: 'Código do Produto ausente',
      })
    }
    if (!l.temPreco) {
      problemas.push({
        linha: l.linha,
        codigo: l.codigo,
        tipo: 'preco_ausente',
        motivo: 'Preço Final ausente',
      })
    } else if (isNaN(l.precoFinal)) {
      problemas.push({
        linha: l.linha,
        codigo: l.codigo,
        tipo: 'preco_invalido',
        motivo: `Preço inválido ("${l.precoBruto}")`,
      })
    } else if (l.precoFinal < 0) {
      problemas.push({
        linha: l.linha,
        codigo: l.codigo,
        tipo: 'preco_negativo',
        motivo: 'Preço negativo',
      })
    } else if (l.precoFinal === 0) {
      problemas.push({
        linha: l.linha,
        codigo: l.codigo,
        tipo: 'preco_zero',
        motivo: 'Preço igual a zero',
      })
    }

    const chave = l.codigo.toUpperCase()
    if (l.codigo) {
      const primeira = codigosVistos.get(chave)
      if (primeira !== undefined) {
        problemas.push({
          linha: l.linha,
          codigo: l.codigo,
          tipo: 'codigo_duplicado',
          motivo: `Código duplicado no arquivo (também na linha ${primeira})`,
        })
      } else {
        codigosVistos.set(chave, l.linha)
      }
    }
  }
  return problemas
}

// ---------------------------------------------------------------------------
// Modelo .xlsx
// ---------------------------------------------------------------------------

/** Gera e baixa o modelo .xlsx de importação de preços com um exemplo preenchido. */
export function baixarModeloImportacaoPrecos(): void {
  const exemplo = [
    {
      'Código do Produto': 'VD-1001',
      Descrição: 'Balcão Frigorífico Inox 1.8m',
      Unidade: 'UN',
      Categoria: 'Balcões Refrigerados',
      'Preço Final (R$)': 18500,
      Fornecedor: 'Produção Interna',
      Observação: 'Linha premium 2024',
    },
    {
      'Código do Produto': 'VD-1002',
      Descrição: 'Câmara Fria Modulada 2x2m',
      Unidade: 'UN',
      Categoria: 'Câmaras Frigoríficas',
      'Preço Final (R$)': 32000,
      Fornecedor: '',
      Observação: '',
    },
    {
      'Código do Produto': 'VD-1003',
      Descrição: 'Mesa de Apoio Inox 1.2m',
      Unidade: 'UN',
      Categoria: 'Mesas & Bancadas',
      'Preço Final (R$)': 4200.5,
      Fornecedor: 'Metalúrgica Aliança',
      Observação: 'Prazo de entrega 30 dias',
    },
  ]

  const ws = XLSX.utils.json_to_sheet(exemplo)
  ws['!cols'] = [
    { wch: 20 },
    { wch: 34 },
    { wch: 10 },
    { wch: 24 },
    { wch: 16 },
    { wch: 22 },
    { wch: 28 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Importacao Precos')
  XLSX.writeFile(wb, 'modelo_importacao_precos.xlsx')
}
