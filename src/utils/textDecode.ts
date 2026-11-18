/**
 * Decodificação de arquivos de texto de importação (CSV/TSV/TXT).
 *
 * Planilhas salvas pelo Excel em Windows normalmente ficam em windows-1252
 * (Latin-1). Se o arquivo for lido como UTF-8, cada byte acentuado (é, ç, ã…)
 * vira o caractere de substituição U+FFFD ("�") — e a informação é perdida.
 *
 * Estratégia: decodificar como UTF-8 e, se aparecer U+FFFD, reinterpretar os
 * bytes como windows-1252.
 */
export async function lerTextoArquivo(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes('\uFFFD')) return utf8

  // Reinterpretar como windows-1252 (fallback "windows-1252" existe em todos
  // os browsers; se indisponível, usa "iso-8859-1", equivalente aqui).
  try {
    return new TextDecoder('windows-1252').decode(buffer)
  } catch {
    return new TextDecoder('iso-8859-1').decode(buffer)
  }
}
