import * as XLSX from 'xlsx'
import type { TipoItemBom } from '@/types/erp'
import { aceitaFilhos } from '@/types/erp'
import { parseCsvOrTsv } from '@/utils/csvParser'
import { lerTextoArquivo } from '@/utils/textDecode'

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
  /**
   * Custo EFETIVO com a regra de preço aplicada (planilha > cadastro > 0),
   * anotado pelo diálogo do preview quando o cadastro de componentes é
   * conhecido — mostra na árvore o preço que de fato será gravado.
   */
  custoEfetivo?: number
  /** true quando o custo efetivo veio do cadastro (planilha sem preço). */
  custoHerdado?: boolean
  /**
   * Tipo ausente ou não reconhecido na planilha: resolvido no fim da
   * interpretação (raiz → produto_final; com filhos → componente_interno;
   * folha → componente_terceiros) com aviso, sem bloquear a importação.
   */
  tipoDesconhecido?: boolean
}

export interface BomsInterpretados {
  boms: NoImportado[] // raízes — uma por BOM (nível base da planilha)
  erros: ErroImportacao[]
  avisos: AvisoImportacao[]
  totalLinhas: number
  /** Itens que vieram sem preço (célula vazia ou zero): herdam o preço do cadastro, ou 0 se novos. */
  itensSemPreco: number
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

/** Cabeçalhos gerados pelo Excel/SheetJS quando a coluna não tem título. */
const SEM_CABECALHO = /^(column_\w*|col(umn)?\d*|empty(_\d+)?|[a-z]|__empty.*|_?)$/

const TIPOS_VALIDOS: TipoItemBom[] = [
  'produto_final',
  'produto_semi_acabado',
  'componente_interno',
  'componente_terceiros',
]

/** Rótulo amigável para o aviso de tipo inferido. */
const labelAssumido = (t: TipoItemBom): string =>
  t === 'produto_final'
    ? 'Produto Final'
    : t === 'componente_interno'
      ? 'Componente Interno'
      : 'Componente de Terceiros'

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

  // Colunas sem cabeçalho nomeado (ex.: "column_2", "__EMPTY_1"): o código do
  // componente costuma ser a primeira dessas colunas com valor — usado como
  // fallback quando nenhuma coluna de código nomeada foi encontrada. Números
  // puros são ignorados (devem ser nível/quantidade/custo, não código).
  const primeiraSemCabecalho = (): string => {
    for (const [k, v] of Object.entries(row)) {
      if (!SEM_CABECALHO.test(k)) continue
      const s = v !== undefined && v !== null ? String(v).trim() : ''
      if (s !== '' && !/^\d+([.,]\d+)?$/.test(s)) return s
    }
    return ''
  }
  const codigoSemCabecalho = primeiraSemCabecalho()
  // Descrição: a coluna sem título seguinte à do código (ex.: column_3) costuma
  // ser a descrição; cai nela quando nenhuma coluna de descrição nomeada existe.
  let descricaoSemCabecalho = ''
  if (codigoSemCabecalho) {
    let achouCodigo = false
    for (const [k, v] of Object.entries(row)) {
      if (!SEM_CABECALHO.test(k)) continue
      const s = v !== undefined && v !== null ? String(v).trim() : ''
      if (!achouCodigo) {
        if (s === codigoSemCabecalho) achouCodigo = true
        continue
      }
      if (s !== '' && s !== codigoSemCabecalho) {
        descricaoSemCabecalho = s
        break
      }
    }
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
    codigo:
      buscar(
        ...chaves(
          'codigo',
          'codigo_componente',
          'codigo_do_componente',
          'cod',
          'code',
          'part_number',
          'referencia',
          'ref',
        ),
      ) || codigoSemCabecalho,
    descricao:
      buscar(...chaves('descricao', 'description', 'desc', 'nome', 'item')) ||
      descricaoSemCabecalho,
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

/**
 * Lê um arquivo .xlsx/.xls e devolve as linhas com chaves normalizadas.
 * Aceita planilhas cujos cabeçalhos NÃO estão na primeira linha física
 * (títulos, linhas em branco, logo acima da tabela): encontra a linha que
 * contém os títulos conhecidos e reidrata as linhas a partir dela. Colunas
 * sem título recebem um nome genérico (column_2, column_3...) em vez de
 * "undefined"/vazio, e o código/descrição caem nelas via fallback em
 * mapearLinha.
 */
export async function lerPlanilhaXlsx(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []

  const mat = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  })
  if (mat.length === 0) return []

  // Localiza a linha de cabeçalho: a primeira com pelo menos 1 célula de
  // texto que case com uma das colunas conhecidas (nivel/codigo/...).
  const normalizados = mat.map((linha) =>
    (linha as unknown[]).map((c) => normalizar(String(c ?? ''))),
  )
  let idxCab = normalizados.findIndex((linha) =>
    linha.some((c) =>
      chaves(
        'nivel',
        'codigo',
        'codigo_componente',
        'codigo_do_componente',
        'descricao',
        'tipo',
        'quantidade',
      ).includes(c),
    ),
  )
  const semCabecalhoReconhecivel = idxCab === -1
  if (semCabecalhoReconhecivel) {
    // Nenhum título conhecido: se a 1ª linha tem célula numérica, ela já é
    // DADO (linha de BOM), não cabeçalho — trata a planilha inteira como sem
    // cabeçalho. Cabeçalho real não tem célula numérica.
    const primeiraLinhaTemNumero = (mat[0] as unknown[]).some((c) => {
      const s = String(c ?? '').trim()
      return s !== '' && !isNaN(Number(s))
    })
    idxCab = primeiraLinhaTemNumero ? -1 : 0
  }

  const cabecalho = semCabecalhoReconhecivel ? null : normalizados[idxCab]
  const nomear = (valorBruto: string, idx: number): string => {
    if (valorBruto && !SEM_CABECALHO.test(valorBruto)) return valorBruto
    return `column_${idx + 1}` // nome estável para coluna sem título
  }

  const rows: Record<string, unknown>[] = []
  const inicio = semCabecalhoReconhecivel ? 0 : idxCab + 1
  for (let i = inicio; i < mat.length; i++) {
    const linha = mat[i] as unknown[]
    if (linha.every((c) => c === undefined || c === null || String(c).trim() === '')) continue
    const obj: Record<string, unknown> = {}
    if (cabecalho) {
      cabecalho.forEach((c, idx) => {
        obj[nomear(c, idx)] = linha[idx] ?? ''
      })
      // Células além do alcance do cabeçalho (colunas extras sem título à direita)
      for (let idx = cabecalho.length; idx < linha.length; idx++) {
        obj[`column_${idx + 1}`] = linha[idx] ?? ''
      }
    } else {
      // Planilha inteira sem cabeçalho: todas as colunas viram column_N
      linha.forEach((c, idx) => {
        obj[`column_${idx + 1}`] = c ?? ''
      })
    }
    rows.push(obj)
  }
  return rows
}

/** Lê um arquivo .csv (vírgula, ponto-e-vírgula ou tabulação). */
export async function lerPlanilhaCsv(file: File): Promise<Record<string, unknown>[]> {
  const text = await lerTextoArquivo(file) // trata windows-1252 vs UTF-8
  const { rows, headers } = parseCsvOrTsv(text)
  return rows.map((r) => {
    const obj: Record<string, unknown> = {}
    headers.forEach((h, idx) => {
      const nh = normalizar(h)
      // Coluna sem título no CSV também vira column_N (fallback de código);
      // índice garante que duas colunas sem título não colidam na mesma chave.
      const chave = nh && !SEM_CABECALHO.test(nh) ? nh : `column_${idx + 1}`
      obj[chave] = (r as Record<string, string>)[h]
    })
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
 * Monta a(s) árvore(s): cada linha cujo nível é o MENOR nível válido da
 * planilha (a "base") inicia um novo BOM; o pai de cada linha é a linha
 * anterior mais próxima com nível imediatamente inferior.
 * Formatos aceitos:
 * a) base 0 — produto final como raiz (0, 1, 2...): comportamento antigo.
 * b) base 1 — blocos cuja raiz é componente interno / semi-acabado / KIT
 *    (1, 2, 3...), sem nível 0: cada bloco de nível 1 vira uma BOM completa.
 * Múltiplas listas: cada vez que o nível reinicia para a base, começa uma
 * nova BOM. Níveis intermediários viram sub-BOM/referência na regra já
 * existente (código raiz de outro BOM).
 */
export function interpretarBoms(rows: Record<string, unknown>[]): BomsInterpretados {
  const erros: ErroImportacao[] = []
  const avisos: AvisoImportacao[] = []
  const raizes: NoImportado[] = []
  const pilha: NoImportado[] = []
  const codigosVistos = new Map<string, number>() // código -> linha da 1ª ocorrência

  // 1ª passada: mapear as linhas e descobrir a base (o menor nível válido da
  // planilha) — em vez de assumir que a raiz é sempre o nível 0.
  const linhas = rows.map((row, i) => mapearLinha(row, i + 2)) // linha 1 = cabeçalho
  const niveisValidos = linhas.filter((l) => l.nivel >= 0)
  const base = niveisValidos.length > 0 ? Math.min(...niveisValidos.map((l) => l.nivel)) : 0

  let totalLinhas = 0

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]

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
    // Tipo ausente ou não reconhecido NÃO bloqueia: resolvido no fim com aviso
    if (!normalizarTipo(linha.tipoBruto)) no.tipoDesconhecido = true
    if (!linha.temQuantidade) no.avisos.push('Quantidade ausente')
    else if (linha.quantidade <= 0) no.avisos.push('Quantidade igual a zero')
    if (!linha.temCusto)
      no.avisos.push(
        'Custo unitário ausente — será usado o preço já cadastrado (ou zero, se o item for novo)',
      )
    else if (linha.custoUnitario <= 0)
      no.avisos.push(
        'Custo unitário igual a zero — será usado o preço já cadastrado (ou zero, se o item for novo)',
      )

    // --- Código repetido ---------------------------------------------------
    // O MESMO componente de terceiros aparece em várias listas da planilha
    // (ex.: uma chapa usada em 40 subconjuntos): isso é esperado — vira aviso,
    // não erro, e o cadastro único é reaproveitado em todas as BOMs.
    const chaveCodigo = linha.codigo.toUpperCase()
    if (linha.codigo) {
      const primeiraLinha = codigosVistos.get(chaveCodigo)
      if (primeiraLinha !== undefined) {
        no.avisos.push(
          `Código repetido (também na linha ${primeiraLinha}) — o mesmo cadastro será reaproveitado`,
        )
      } else {
        codigosVistos.set(chaveCodigo, linha.linha)
      }
    }

    // --- Hierarquia --------------------------------------------------------
    // Linha na nível base = raiz de um novo BOM (novo bloco/lista).
    if (linha.nivel === base) {
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
      } else if (!aceitaFilhos(pai.linha.tipo) && !pai.tipoDesconhecido) {
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

  // --- Tipos ausentes/inválidos: inferir e avisar (não bloquear) ------------
  const resolverTipo = (no: NoImportado) => {
    if (no.tipoDesconhecido) {
      const ehRaiz = no.linha.nivel === base
      const assumido: TipoItemBom =
        ehRaiz && base === 0
          ? 'produto_final'
          : no.filhos.length > 0
            ? 'componente_interno'
            : 'componente_terceiros'
      no.linha.tipo = assumido
      no.tipoDesconhecido = false
      avisos.push({
        linha: no.linha.linha,
        codigo: no.linha.codigo,
        motivo: `Tipo ${no.linha.tipoBruto ? `inválido ("${no.linha.tipoBruto}")` : 'ausente'} — assumido "${labelAssumido(assumido)}"`,
      })
    }
    no.filhos.forEach(resolverTipo)
  }
  raizes.forEach(resolverTipo)

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

  // Contagem de itens sem preço (célula vazia ou zero) — válida para todos
  // os tipos importados (produto acabado, terceiros, interno, KIT). O aviso
  // resumido usa esse número: itens existentes herdam o preço do cadastro,
  // itens novos entram com valor zerado.
  let itensSemPreco = 0
  const contarSemPreco = (no: NoImportado) => {
    if (no.status !== 'erro' && no.linha.custoUnitario <= 0) itensSemPreco++
    no.filhos.forEach(contarSemPreco)
  }
  raizes.forEach(contarSemPreco)

  return { boms: raizes, erros, avisos, totalLinhas, itensSemPreco }
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
