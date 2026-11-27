/**
 * Regra única de texto do sistema: reparo de mojibake (dupla codificação e
 * U+FFFD), normalização de entrada e busca sem acento.
 *
 * Todo caminho de escrita (formulários, editores, importadores de planilha,
 * edição em lote) passa texto de usuário por `normalizarTexto`; toda busca por
 * texto livre compara com `normalizarBusca`.
 */

/**
 * Repara dupla codificação UTF-8→Latin-1→UTF-8 ("Ã©"→"é", "Ã§"→"ç",
 * "BraÃ§o"→"Braço"). Reconstrói o codepoint UTF-8 original quando encontra um
 * byte líder (0xC2–0xEF) seguido de byte(s) de continuação "visíveis" como
 * Latin-1. Repete até estabilizar (tripla codificação também cai).
 */
export function repararDuplaCodificacao(s: string): string {
  if (!s) return s
  let atual = s
  for (let volta = 0; volta < 3; volta++) {
    // Heurística de guarda: só reconstrói se houver padrão típico de dupla
    // codificação — evita mexer em texto que contém "Ã"/"Â" legítimos.
    if (!/[ÃÂ][\u0080-\u00BF]/.test(atual)) break
    let out = ''
    let i = 0
    while (i < atual.length) {
      const c = atual.charCodeAt(i)
      const n = i + 1 < atual.length ? atual.charCodeAt(i + 1) : -1
      const n2 = i + 2 < atual.length ? atual.charCodeAt(i + 2) : -1
      if (c >= 0xc2 && c <= 0xdf && n >= 0x80 && n <= 0xbf) {
        out += String.fromCharCode(((c & 0x1f) << 6) | (n & 0x3f))
        i += 2
      } else if (c >= 0xe0 && c <= 0xef && n >= 0x80 && n <= 0xbf && n2 >= 0x80 && n2 <= 0xbf) {
        out += String.fromCharCode(((c & 0x0f) << 12) | ((n & 0x3f) << 6) | (n2 & 0x3f))
        i += 3
      } else {
        out += atual[i]
        i += 1
      }
    }
    if (out === atual) break
    atual = out
  }
  return atual
}

/** Tabela de reparo para U+FFFD em palavras de português conhecidas. */
const REPAROS_UFFFD: Array<[RegExp, string]> = [
  [/\uFFFD\uFFFD(o|O)\b/g, 'ão'],
  [/\uFFFD\uFFFD(es)\b/g, 'ções'],
  [
    /([Jj]acar|[Mm]edia|[Tt]ungst|[Gg]s|[Cc]er|[Ll]umin|[Ee]l[st]|[Hh]erm|[Ee]xpan|[Tt]ermost|[Bb]alc|[Nn][iv]|[Vv]it|[Pp]r|[Ss]|[Ff]|[Mm]|[Ee]|[Rr]|[Vv]|[Ii]|[Pp]|[Cc])\uFFFD/g,
    '$1é',
  ],
  [/(Bra|bra)\uFFFD/g, '$1ço'],
  [/([Aa])\uFFFD/g, '$1ç'],
  [/\uFFFD/g, ''],
]

/**
 * Normaliza texto de entrada do usuário: repara mojibake (dupla codificação),
 * corrige/remove U+FFFD remanescente, faz trim e colapsa espaços repetidos.
 * NÃO altera acentuação correta — só corrige texto quebrado.
 */
export function normalizarTexto(s: string | null | undefined): string {
  if (s === null || s === undefined) return ''
  let t = repararDuplaCodificacao(String(s))
  if (t.includes('\uFFFD')) {
    for (const [re, sub] of REPAROS_UFFFD) t = t.replace(re, sub)
  }
  return t.replace(/\s+/g, ' ').trim()
}

/**
 * Remove acentos e cedilha (Elétrica→Eletrica, ção→cao). Para normalizar
 * termos de busca: "eletrica" encontra "Elétrica", "cao" encontra "ção".
 */
export function removerAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Termo de busca padronizado: minúsculo, sem acentos, espaços colapsados.
 */
export function normalizarBusca(s: string | null | undefined): string {
  return removerAcentos(String(s ?? '').toLowerCase())
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Verdadeiro quando o texto contém caracteres de mojibake (U+FFFD ou padrão
 * de dupla codificação). Usado para avisos de importação.
 */
export function textoTemMojibake(s: string | null | undefined): boolean {
  if (!s) return false
  return String(s).includes('\uFFFD') || /[ÃÂ][\u0080-\u00BF]/.test(String(s))
}

/**
 * Lê um arquivo (CSV/TSV/XLSX-derivado) como texto detectando a codificação:
 * tenta UTF-8 estrito e, se houver byte inválido, refaz como windows-1252
 * (Latin-1) — evita "El�trica" em planilhas salvas no Excel brasileiro.
 */
export async function lerTextoArquivo(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  // Detecta bytes UTF-8 de múltiplos bytes válidos? Se o texto decodificado
  // contém U+FFFD, o arquivo não é UTF-8 válido — refaz como windows-1252.
  if (!utf8.includes('\uFFFD')) return utf8
  return new TextDecoder('windows-1252').decode(buffer)
}
