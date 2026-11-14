// Reprodução do bug "não há código de produto" com a MESMA lib do app (SheetJS).
// Uso: node scripts/repro-bug-precos.mjs <arquivo.xlsx>
// Apenas diagnóstico — não é executado pela aplicação. Não contém dados da planilha.
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'

const normalizarCabecalho = (h) =>
  String(h)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

// Comportamento ANTES da correção (apenas chaves exatas, sem codigo_do_produto)
const aliasAntigos = ['codigo_produto', 'codigo', 'cod', 'sku', 'code', 'referencia']
// Comportamento DEPOIS (chave real do cabeçalho incluída)
const aliasNovos = [
  'codigo_produto',
  'codigo',
  'codigo_do_produto',
  'cod_produto',
  'cod',
  'sku',
  'code',
  'referencia',
  'sku_produto',
]

const caminho = process.argv[2]
if (!caminho) {
  console.error('Informe o caminho do arquivo .xlsx')
  process.exit(1)
}

const wb = XLSX.read(readFileSync(caminho), { type: 'buffer' })
console.log('Abas:', wb.SheetNames)
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

if (rows.length === 0) {
  console.log('Nenhuma linha lida.')
  process.exit(0)
}

const chaves = Object.keys(rows[0])
console.log('Chaves cruas da 1ª linha:', JSON.stringify(chaves))
const chavesNorm = chaves.map(normalizarCabecalho)
console.log('Chaves normalizadas:', JSON.stringify(chavesNorm))

const achaChave = (aliases) => {
  for (const a of aliases) {
    const k = chavesNorm.find((c) => c === a || c.startsWith(a) || c.includes(a))
    if (k) return k
  }
  return null
}

const kAntes = achaChave(aliasAntigos)
const kDepois = achaChave(aliasNovos)
console.log('Código antes da correção:', kAntes ?? 'NÃO ENCONTRADO → "Código do Produto ausente"')
console.log('Código depois da correção:', kDepois ?? 'não encontrado')

if (kDepois) {
  const idx = chavesNorm.indexOf(kDepois)
  const preenchidas = rows.filter((r) => {
    const v = r[chaves[idx]]
    return v !== undefined && v !== null && String(v).trim() !== ''
  })
  console.log(`Linhas com código preenchido (depois): ${preenchidas.length} de ${rows.length}`)
}

// Amostra APENAS da estrutura (tipos, sem valores de dados):
const primeiro = rows[0]
console.log(
  'Tipos de célula na 1ª linha:',
  Object.keys(primeiro)
    .map((k) => `${normalizarCabecalho(k)}:${typeof primeiro[k]}`)
    .join(', '),
)
