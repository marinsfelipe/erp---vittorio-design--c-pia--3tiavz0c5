export function parseCsvOrTsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  // Detectar delimitador (vírgula, ponto e vírgula, tabulação)
  const firstLine = lines[0]
  let delimiter = ','
  const semicolons = (firstLine.match(/;/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length
  const tabs = (firstLine.match(/\t/g) || []).length

  if (tabs > commas && tabs > semicolons) {
    delimiter = '\t'
  } else if (semicolons > commas) {
    delimiter = ';'
  }

  function splitLine(line: string): string[] {
    const result: string[] = []
    let cur = ''
    let insideQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' || char === "'") {
        insideQuotes = !insideQuotes
      } else if (char === delimiter && !insideQuotes) {
        result.push(cur.trim())
        cur = ''
      } else {
        cur += char
      }
    }
    result.push(cur.trim())
    return result.map((col) => col.replace(/^["']|["']$/g, '').trim())
  }

  const rawHeaders = splitLine(lines[0])
  const headers = rawHeaders.map((h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  )

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i])
    if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue

    const rowObj: Record<string, string> = {}
    rawHeaders.forEach((rawH, idx) => {
      rowObj[rawH] = cols[idx] !== undefined ? cols[idx] : ''
    })
    rows.push(rowObj)
  }

  return { headers: rawHeaders, rows }
}

export function mapRowToComponente(row: Record<string, string>): {
  codigo: string
  descricao: string
  categoria: string
  unidade: string
  custo_unitario: number
  fornecedor: string
} | null {
  const normKeys: Record<string, string> = {}
  for (const [key, val] of Object.entries(row)) {
    const cleaned = key
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
    normKeys[cleaned] = val
  }

  const codigo =
    normKeys['codigo'] ||
    normKeys['cod'] ||
    normKeys['code'] ||
    normKeys['part number'] ||
    normKeys['referencia'] ||
    normKeys['ref'] ||
    ''

  const descricao =
    normKeys['descricao'] ||
    normKeys['desc'] ||
    normKeys['description'] ||
    normKeys['nome'] ||
    normKeys['item'] ||
    ''

  if (!codigo || !descricao) {
    return null
  }

  const categoria =
    normKeys['categoria'] || normKeys['cat'] || normKeys['category'] || normKeys['grupo'] || 'Geral'

  const unidade =
    normKeys['unidade'] ||
    normKeys['un'] ||
    normKeys['und'] ||
    normKeys['unit'] ||
    normKeys['u.m.'] ||
    'UN'

  const rawCusto =
    normKeys['custo'] ||
    normKeys['custo unitario'] ||
    normKeys['custo_unitario'] ||
    normKeys['preco'] ||
    normKeys['valor'] ||
    normKeys['cost'] ||
    '0'

  // Tratar formatação de moeda brasileira: R$ 1.250,50 ou 1250.50
  const cleanedCusto = String(rawCusto)
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const custo_unitario = Math.max(0, parseFloat(cleanedCusto) || 0)

  const fornecedor =
    normKeys['fornecedor'] ||
    normKeys['fabricante'] ||
    normKeys['supplier'] ||
    normKeys['vendor'] ||
    'Geral'

  return {
    codigo: codigo.trim().toUpperCase(),
    descricao: descricao.trim(),
    categoria: categoria.trim(),
    unidade: unidade.trim().toUpperCase(),
    custo_unitario,
    fornecedor: fornecedor.trim(),
  }
}
