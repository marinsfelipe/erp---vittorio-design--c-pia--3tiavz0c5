import * as XLSX from 'xlsx'
import { parseCsvOrTsv } from '@/utils/csvParser'
import { lerTextoArquivo } from '@/utils/textDecode'

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

/**
 * Normaliza o texto de um cabeçalho para usar como chave: minúsculas, sem
 * acentos, sem pontuação, espaços colapsados para um único sublinhado.
 * "Código do Produto" / "código  do produto " → "codigo_do_produto";
 * "Preço Final (R$)" → "preco_final"; "Cód." → "cod".
 */
export function normalizarCabecalho(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizarChaves(row: Record<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    obj[normalizarCabecalho(k)] = v
  }
  return obj
}

/**
 * Procura a linha cujo CONTEÚDO pareça um cabeçalho da tabela de preços: deve
 * mencionar "código" (ou SKU) E "preço"/"valor" — ou "código" + "descrição".
 * Recebe os textos NORMALIZADOS das células da linha (não as chaves de um
 * objeto), pois a detecção roda sobre linhas cruas lidas com header:1 — onde as
 * chaves de um objeto seriam apenas índices de coluna ("0", "1", ...).
 * Isso tolera título, linha em branco ou células mescladas antes do cabeçalho.
 */
const pareceCabecalho = (textos: string[]): boolean => {
  const temCodigo = textos.some((t) => t.includes('codigo') || t.includes('sku'))
  const temPreco = textos.some((t) => t.includes('preco') || t.includes('valor'))
  const temDescricao = textos.some((t) => t.includes('descricao') || t.includes('produto'))
  return temCodigo && (temPreco || temDescricao)
}

/** Textos normalizados e não vazios de uma linha crua (array de células). */
const textosDaLinha = (linha: unknown[] | null | undefined): string[] =>
  (linha || [])
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
    .map((v) => normalizarCabecalho(String(v)))
    .filter((t) => t !== '')

/** Lê um arquivo .xlsx/.xls/.csv e devolve as linhas com chaves normalizadas. */
export async function lerPlanilhaPrecos(file: File): Promise<Record<string, unknown>[]> {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })

    // 1. Aba certa: "Importacao Precos", senão a primeira que pareça cabeçalho
    let sheetName = wb.SheetNames.find((n) => normalizarCabecalho(n).includes('importacao_precos'))
    if (!sheetName) {
      sheetName = wb.SheetNames.find((n) => {
        const ws = wb.Sheets[n]
        if (!ws) return false
        const rawAba = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        return rawAba.some((r) => pareceCabecalho(textosDaLinha(r as unknown[])))
      })
    }
    const sheet = (sheetName && wb.Sheets[sheetName]) || wb.Sheets[wb.SheetNames[0]]
    if (!sheet) {
      throw new Error('A planilha não possui nenhuma aba com conteúdo.')
    }

    // 2. Linhas cruas COM cabeçalho incluído (header:1), para achar a linha do
    //    cabeçalho mesmo que não seja a primeira da aba. A detecção compara o
    //    TEXTO das células (não índices de coluna).
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    const idxCabecalho = raw.findIndex((r) => pareceCabecalho(textosDaLinha(r as unknown[])))
    if (idxCabecalho < 0) {
      throw new Error(
        'Não foi possível localizar a linha de cabeçalho na planilha. Verifique se o arquivo contém as colunas "Código do Produto", "Descrição" e "Preço Final (R$)".',
      )
    }

    // 3. Monta objetos usando a linha detectada como cabeçalho
    const headers = idxCabecalho >= 0 ? (raw[idxCabecalho] as unknown[]) : []
    const dataRows = idxCabecalho >= 0 ? raw.slice(idxCabecalho + 1) : []
    return dataRows.map((r) => {
      const obj: Record<string, unknown> = {}
      const linha = (r as unknown[]) || []
      headers.forEach((h, c) => {
        if (h === null || h === undefined || String(h).trim() === '') return
        obj[normalizarCabecalho(String(h))] = linha[c] ?? ''
      })
      return obj
    })
  }
  // CSV: vírgula, ponto-e-vírgula ou tabulação (detecta UTF-8 × windows-1252)
  const text = await lerTextoArquivo(file)
  const { rows, headers } = parseCsvOrTsv(text)
  return rows.map((r) => {
    const obj: Record<string, unknown> = {}
    for (const h of headers) {
      obj[normalizarCabecalho(h)] = (r as Record<string, string>)[h]
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

/**
 * Busca o valor de um campo na linha crua por apelidos normalizados; se nenhum
 * apelido casar exatamente, cai para matching flexível (prefixo/contém), o que
 * tolera variações como "Cód.", "SKU do item", "Preço Final s/ ICMS" etc.
 */
function criarBuscador(row: Record<string, unknown>) {
  const chaves = Object.keys(row)
  const buscar = (...apelidos: string[]): string => {
    for (const a of apelidos) {
      const v = row[a]
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
    }
    for (const a of apelidos) {
      const k = chaves.find((c) => c.startsWith(a) || c.includes(a))
      if (k) {
        const v = row[k]
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
      }
    }
    return ''
  }
  return buscar
}

/** Mapeia as linhas cruas para LinhaPrecos. */
export function mapearLinhasPrecos(rows: Record<string, unknown>[]): LinhaPrecos[] {
  const out: LinhaPrecos[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const buscar = criarBuscador(row)

    const codigo = buscar(
      'codigo_produto',
      'codigo',
      'codigo_do_produto',
      'cod_produto',
      'cod',
      'sku',
      'code',
      'referencia',
      'sku_produto',
    )
    const descricao = buscar(
      'descricao',
      'descricao_produto',
      'produto',
      'nome',
      'item',
      'desc',
      'description',
    )
    const unidade = (buscar('unidade', 'und', 'un', 'unit') || 'UN').toUpperCase()
    const categoria = buscar('categoria', 'category', 'grupo') || 'Geral'
    const precoBruto = buscar(
      'preco_final',
      'preco',
      'valor',
      'preco_venda',
      'price',
      'preco_unitario',
    )
    const temPreco = precoBruto !== ''
    const precoFinal = temPreco ? parsePrecoBr(precoBruto) : 0
    const fornecedor = buscar('fornecedor', 'fabricante', 'supplier')
    const observacao = buscar('observacao', 'obs', 'observacoes', 'nota')

    // Linha totalmente vazia: pular silenciosamente
    if (!codigo && !descricao && !temPreco && !categoria && !fornecedor && !observacao) continue
    // Demais linhas seguem SEMPRE para a validação linha a linha: se uma coluna
    // esperada (código, preço...) não for encontrada, cada linha é mantida e o
    // problema correspondente é relatado no preview — nunca "nenhuma linha".

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
