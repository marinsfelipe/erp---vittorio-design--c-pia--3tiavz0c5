import * as XLSX from 'xlsx'
import type { TipoItemBom } from '@/types/erp'
import { aceitaFilhos } from '@/types/erp'
import { parseCsvOrTsv } from '@/utils/csvParser'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface LinhaImportada {
  linha: number // nº da linha na planilha (1 = cabeçalho)
  nivel: number // -1 quando inválido
  codigo: string
  descricao: string
  tipo: TipoItemBom
  tipoBruto: string
  categoria: string
  unidade: string
  quantidade: number
  custoUnitario: number
  fornecedor: string
  temQuantidade: boolean
  temCusto: boolean
}

export interface ErroImportacao {
  linha: number
  codigo: string
  motivo: string
}

export interface AvisoImportacao {
  linha: number
  codigo: string
  motivo: string
}

export interface NoImportado {
  linha: LinhaImportada
  filhos: NoImportado[]
  status: 'ok' | 'erro'
  erros: string[] // erros do próprio nó (bloqueantes)
  avisos: string[] // avisos do nó (não bloqueantes)
  /** Custo unitário por rolagem (fabricados) — preenchido no preview. */
  custoRolado?: number
}

export interface BomsInterpretados {
  boms: NoImportado[] // raízes (nível 0), um por BOM
  erros: ErroImportacao[]
  avisos: AvisoImportacao[]
  totalLinhas: number
}

// ---------------------------------------------------------------------------
// Normalização de colunas e valores
// ---------------------------------------------------------------------------

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const chaves = (...nomes: string[]) => nomes.map(normalizar)

const TIPOS_VALIDOS: TipoItemBom[] = [
  'produto_final',
  'produto_semi_acabado',
  'componente_interno',
  'componente_terceiros',
]

export const normalizarTipo = (raw: string): TipoItemBom | null => {
  const n = normalizar(raw)
  if (TIPOS_VALIDOS.includes(n as TipoItemBom)) return n as TipoItemBom
  const semSeparador = n.replace(/_/g, '')
  const apelidos: Record<string, TipoItemBom> = {
    produtofinal: 'produto_final',
    final: 'produto_final',
    semiacabado: 'produto_semi_acabado',
    semiacab: 'produto_semi_acabado',
    componenteinterno: 'componente_interno',
    interno: 'componente_interno',
    componenteterceiros: 'componente_terceiros',
    terceiros: 'componente_terceiros',
  }
  return apelidos[semSeparador] ?? null
}

const parseNumeroBr = (raw: string): number => {
  if (!raw) return 0
  const limpo = String(raw)
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = parseFloat(limpo)
  return isNaN(n) ? 0 : n
}

const parseNumeroEn = (raw: string): number => {
  if (!raw) return 0
  const n = parseFloat(String(raw).replace(/[R$\s]/g, ''))
  return isNaN(n) ? 0 : n
}

function mapearLinha(row: Record<string, unknown>, numeroLinha: number): LinhaImportada {
  const buscar = (...nomes: string[]): string => {
    for (const nome of nomes) {
      const v = row[nome]
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
    }
    return ''
  }

  // Nível pode vir como "0", "0.0" (xlsx numérico) ou "Nível 2"
  const rawNivel = buscar(...chaves('nivel', 'level', 'nvl'))
  const nivel = parseInt(rawNivel.replace(/[^\d]/g, ''), 10)
  const nivelOk = !isNaN(nivel)

  const tipoBruto = buscar(...chaves('tipo', 'type', 'tipo_item'))
  const tipo = normalizarTipo(tipoBruto)

  const rawQtd = buscar(...chaves('quantidade', 'qtd', 'quantity', 'qtde'))
  const temQuantidade = rawQtd !== ''
  const quantidade = temQuantidade
    ? rawQtd.includes(',')
      ? parseNumeroBr(rawQtd)
      : parseNumeroEn(rawQtd)
    : 0

  const rawCusto = buscar(
    ...chaves('custo_unitario', 'custo', 'custo_unit', 'preco', 'valor', 'cost'),
  )
  const temCusto = rawCusto !== ''
  const custoUnitario = temCusto
    ? rawCusto.includes(',')
      ? parseNumeroBr(rawCusto)
      : parseNumeroEn(rawCusto)
    : 0

  return {
    linha: numeroLinha,
    nivel: nivelOk ? nivel : -1,
    codigo: buscar(...chaves('codigo', 'codigo_componente', 'cod', 'code', 'referencia')),
    descricao: buscar(...chaves('descricao', 'description', 'desc', 'nome', 'item')),
    tipo: tipo ?? ('componente_terceiros' as TipoItemBom),
    tipoBruto,
    categoria: buscar(...chaves('categoria', 'category', 'grupo')) || 'Geral',
    unidade: (buscar(...chaves('unidade', 'und', 'un', 'unit')) || 'UN').toUpperCase(),
    quantidade,
    custoUnitario,
    fornecedor: buscar(...chaves('fornecedor', 'fabricante', 'supplier')) || '',
    temQuantidade,
    temCusto,
  }
}

// ---------------------------------------------------------------------------
// Leitura do arquivo (xlsx e csv)
// ---------------------------------------------------------------------------

/** Reindexa as chaves de uma linha usando os cabeçalhos normalizados. */
function normalizarChaves(row: Record<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    obj[normalizar(k)] = v
  }
  return obj
}

/** Lê um arquivo .xlsx/.xls e devolve as linhas com chaves normalizadas. */
export async function lerPlanilhaXlsx(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  return rows.map(normalizarChaves)
}

/** Lê um arquivo .csv (vírgula, ponto-e-vírgula ou tabulação). */
export async function lerPlanilhaCsv(file: File): Promise<Record<string, unknown>[]> {
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

/** Detecta pelo nome do arquivo e lê xlsx ou csv. */
export async function lerArquivoBom(file: File): Promise<Record<string, unknown>[]> {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) return lerPlanilhaXlsx(file)
  return lerPlanilhaCsv(file)
}

// ---------------------------------------------------------------------------
// Interpretação da árvore pela coluna Nível
// ---------------------------------------------------------------------------

/**
 * Monta a(s) árvore(s): cada linha de nível 0 inicia um novo BOM; o pai de
 * cada linha é a linha anterior mais próxima com nível imediatamente inferior.
 */
export function interpretarBoms(rows: Record<string, unknown>[]): BomsInterpretados {
  const erros: ErroImportacao[] = []
  const avisos: AvisoImportacao[] = []
  const raizes: NoImportado[] = []
  const pilha: NoImportado[] = []
  const codigosVistos = new Map<string, number>() // código -> linha da 1ª ocorrência

  let totalLinhas = 0

  for (let i = 0; i < rows.length; i++) {
    const linha = mapearLinha(rows[i], i + 2) // linha 1 = cabeçalho

    // Linha totalmente vazia: pular silenciosamente
    if (
      !linha.codigo &&
      !linha.descricao &&
      !linha.temQuantidade &&
      !linha.temCusto &&
      linha.nivel === -1
    ) {
      continue
    }
    totalLinhas++

    const no: NoImportado = { linha, filhos: [], status: 'ok', erros: [], avisos: [] }

    // --- Validações de conteúdo ----------------------------------------
    if (linha.nivel === -1) no.erros.push('Nível inválido ou ausente')
    if (!linha.codigo) no.erros.push('Código ausente')
    if (!linha.descricao) no.erros.push('Descrição ausente')
    if (!normalizarTipo(linha.tipoBruto)) {
      no.erros.push(`Tipo inválido ("${linha.tipoBruto || 'vazio'}")`)
    }
    if (!linha.temQuantidade) no.avisos.push('Quantidade ausente')
    else if (linha.quantidade <= 0) no.avisos.push('Quantidade igual a zero')
    if (!linha.temCusto) no.avisos.push('Custo unitário ausente')

    // --- Código duplicado ------------------------------------------------
    const chaveCodigo = linha.codigo.toUpperCase()
    if (linha.codigo) {
      const primeiraLinha = codigosVistos.get(chaveCodigo)
      if (primeiraLinha !== undefined) {
        no.erros.push(`Código duplicado (também na linha ${primeiraLinha})`)
      } else {
        codigosVistos.set(chaveCodigo, linha.linha)
      }
    }

    // --- Hierarquia --------------------------------------------------------
    if (linha.nivel === 0) {
      pilha.length = 0
      pilha.push(no)
      raizes.push(no)
    } else if (linha.nivel > 0) {
      // pai = linha anterior mais próxima com nível imediatamente inferior
      while (pilha.length > 0 && pilha[pilha.length - 1].linha.nivel >= linha.nivel) {
        pilha.pop()
      }
      const pai = pilha[pilha.length - 1]
      if (!pai) {
        no.erros.push(`Linha órfã: nenhum pai com nível ${linha.nivel - 1} acima`)
      } else if (linha.nivel - pai.linha.nivel > 1) {
        no.erros.push(
          `Salto de nível (de ${pai.linha.nivel} para ${linha.nivel}): não há pai imediato`,
        )
      } else if (!aceitaFilhos(pai.linha.tipo)) {
        no.erros.push(`Pai "${pai.linha.codigo}" é ${pai.linha.tipo} (folha) e não aceita filhos`)
      } else {
        pai.filhos.push(no)
      }
      pilha.push(no)
    }
    // nivel -1 (inválido): fica sem pai, apenas com os erros

    if (no.erros.length > 0) no.status = 'erro'
    for (const e of no.erros) erros.push({ linha: linha.linha, codigo: linha.codigo, motivo: e })
    for (const a of no.avisos) avisos.push({ linha: linha.linha, codigo: linha.codigo, motivo: a })
  }

  // --- Rolagem de custo nos nós fabricados (preview) ------------------------
  const rolar = (no: NoImportado): number => {
    if (no.linha.tipo === 'componente_terceiros') {
      no.custoRolado = no.linha.custoUnitario
      return no.custoRolado
    }
    no.custoRolado = no.filhos.reduce((acc, f) => acc + f.linha.quantidade * rolar(f), 0)
    return no.custoRolado
  }
  const avisoFabricadoSemFilhos = (no: NoImportado) => {
    if (no.filhos.length === 0 && no.linha.tipo !== 'componente_terceiros') {
      avisos.push({
        linha: no.linha.linha,
        codigo: no.linha.codigo,
        motivo: 'Item fabricado sem filhos: custo ficará zerado (sem rolagem possível)',
      })
    }
    no.filhos.forEach(avisoFabricadoSemFilhos)
  }
  raizes.forEach((r) => {
    rolar(r)
    avisoFabricadoSemFilhos(r)
  })

  return { boms: raizes, erros, avisos, totalLinhas }
}

// ---------------------------------------------------------------------------
// Modelo .xlsx
// ---------------------------------------------------------------------------

/** Gera e baixa o modelo .xlsx com colunas e um exemplo preenchido. */
export function baixarModeloImportacaoBom(): void {
  const exemplo = [
    {
      Nivel: 0,
      'Codigo do Componente': 'BAL-INOX-180',
      Descricao: 'Balcão Frigorífico Inox 1.8m',
      Tipo: 'produto_final',
      Categoria: 'Balcões Refrigerados',
      Unidade: 'UN',
      Quantidade: 1,
      'Custo Unitario': '',
      Fornecedor: 'Produção Interna',
    },
    {
      Nivel: 1,
      'Codigo do Componente': 'ESTRUT-INOX',
      Descricao: 'Estrutura em Inox 304',
      Tipo: 'produto_semi_acabado',
      Categoria: 'Estrutura & Funilaria',
      Unidade: 'UN',
      Quantidade: 1,
      'Custo Unitario': '',
      Fornecedor: 'Produção Interna',
    },
    {
      Nivel: 2,
      'Codigo do Componente': 'CH-0599',
      Descricao: 'Chapa Inox 304 Escovada 1.0mm',
      Tipo: 'componente_terceiros',
      Categoria: 'Estrutura & Funilaria',
      Unidade: 'M2',
      Quantidade: 3.5,
      'Custo Unitario': 145,
      Fornecedor: 'Aperam South America',
    },
    {
      Nivel: 2,
      'Codigo do Componente': 'PARF-M8',
      Descricao: 'Parafuso Inox M8 x 20mm',
      Tipo: 'componente_terceiros',
      Categoria: 'Fixação',
      Unidade: 'UN',
      Quantidade: 24,
      'Custo Unitario': 1.8,
      Fornecedor: 'Grampos & Cia',
    },
    {
      Nivel: 1,
      'Codigo do Componente': 'REFRIG-KIT',
      Descricao: 'Kit Refrigeração (montagem interna)',
      Tipo: 'componente_interno',
      Categoria: 'Refrigeração',
      Unidade: 'KIT',
      Quantidade: 1,
      'Custo Unitario': '',
      Fornecedor: 'Produção Interna',
    },
    {
      Nivel: 2,
      'Codigo do Componente': 'CMP-0199',
      Descricao: 'Compressor Hermético Inverter 1/3HP',
      Tipo: 'componente_terceiros',
      Categoria: 'Refrigeração',
      Unidade: 'UN',
      Quantidade: 1,
      'Custo Unitario': 750,
      Fornecedor: 'Embraco Brasil',
    },
    {
      Nivel: 2,
      'Codigo do Componente': 'EVAP-0299',
      Descricao: 'Evaporador Roll-Bond Alumínio 900mm',
      Tipo: 'componente_terceiros',
      Categoria: 'Refrigeração',
      Unidade: 'UN',
      Quantidade: 1,
      'Custo Unitario': 185.5,
      Fornecedor: 'Frigoking Componentes',
    },
  ]

  const ws = XLSX.utils.json_to_sheet(exemplo)
  ws['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 38 },
    { wch: 22 },
    { wch: 24 },
    { wch: 8 },
    { wch: 12 },
    { wch: 14 },
    { wch: 26 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Importacao BOM')
  XLSX.writeFile(wb, 'modelo_importacao_bom.xlsx')
}
