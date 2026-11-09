/**
 * Converte um valor numérico em reais (BRL) para sua representação por extenso em Português do Brasil.
 * Exemplo: 1250.50 -> "um mil e duzentos e cinquenta reais e cinquenta centavos"
 */

const UNIDADES = [
  '',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
]

const DEZENAS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
]

const CENTENAS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
]

function converterGrupoAte999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'

  const partes: string[] = []
  const c = Math.floor(n / 100)
  const d = Math.floor((n % 100) / 10)
  const u = n % 10
  const restoDez = n % 100

  if (c > 0) {
    partes.push(CENTENAS[c])
  }

  if (restoDez > 0) {
    if (restoDez < 20) {
      partes.push(UNIDADES[restoDez])
    } else {
      partes.push(DEZENAS[d])
      if (u > 0) {
        partes.push(UNIDADES[u])
      }
    }
  }

  return partes.join(' e ')
}

export function valorPorExtenso(valor: number): string {
  if (isNaN(valor) || valor === null || valor === undefined) return 'zero reais'

  const valorAbs = Math.abs(valor)
  const parteInteira = Math.floor(valorAbs)
  const centavos = Math.round((valorAbs - parteInteira) * 100)

  if (parteInteira === 0 && centavos === 0) {
    return 'zero reais'
  }

  const partesExtenso: string[] = []

  // Escalas: bilhões, milhões, milhares, unidades
  const bilhoes = Math.floor(parteInteira / 1_000_000_000)
  const milhoes = Math.floor((parteInteira % 1_000_000_000) / 1_000_000)
  const milhares = Math.floor((parteInteira % 1_000_000) / 1_000)
  const unidades = parteInteira % 1_000

  if (bilhoes > 0) {
    const txt = converterGrupoAte999(bilhoes)
    partesExtenso.push(`${txt} ${bilhoes === 1 ? 'bilhão' : 'bilhões'}`)
  }

  if (milhoes > 0) {
    const txt = converterGrupoAte999(milhoes)
    partesExtenso.push(`${txt} ${milhoes === 1 ? 'milhão' : 'milhões'}`)
  }

  if (milhares > 0) {
    if (milhares === 1) {
      partesExtenso.push('um mil')
    } else {
      const txt = converterGrupoAte999(milhares)
      partesExtenso.push(`${txt} mil`)
    }
  }

  if (unidades > 0) {
    const txt = converterGrupoAte999(unidades)
    partesExtenso.push(txt)
  }

  let textoReais = ''
  if (parteInteira > 0) {
    const juncao = partesExtenso.join(
      unidades > 0 && unidades < 100 && (milhares > 0 || milhoes > 0 || bilhoes > 0)
        ? ' e '
        : ' e ',
    )

    // Se terminar apenas com "milhões" ou "bilhões" exatos, usa "de reais"
    const soMilhoesOuBilhoes = (milhoes > 0 || bilhoes > 0) && milhares === 0 && unidades === 0
    const moeda = parteInteira === 1 ? 'real' : soMilhoesOuBilhoes ? 'de reais' : 'reais'
    textoReais = `${juncao} ${moeda}`
  }

  let textoCentavos = ''
  if (centavos > 0) {
    const txtCent = converterGrupoAte999(centavos)
    const moedaCent = centavos === 1 ? 'centavo' : 'centavos'
    textoCentavos = `${txtCent} ${moedaCent}`
  }

  if (textoReais && textoCentavos) {
    return `${textoReais} e ${textoCentavos}`
  }
  if (textoReais) {
    return textoReais
  }
  return textoCentavos
}
