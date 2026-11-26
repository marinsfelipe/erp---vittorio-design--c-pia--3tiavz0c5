import type { Bom, BomItem, Componente } from '@/types/erp'
import type { NoImportado } from '@/utils/bomImportParser'
import { componentesService } from '@/services/componentes'
import { bomsService } from '@/services/boms'

export interface ResultadoImportacaoBom {
  bomsCriados: number
  itensCriados: number
  componentesReaproveitados: number
  componentesCriados: number
}

/** Mapa de código (caixa alta) -> componente, para reutilizar por código. */
async function mapaComponentes(): Promise<Map<string, Componente>> {
  const todos = await componentesService.getAll()
  return new Map(todos.map((c) => [c.codigo.toUpperCase(), c]))
}

/**
 * Regra de preço na importação (para produto acabado, componente de terceiros,
 * componente interno e KIT):
 * 1. Planilha traz preço (> 0) -> grava o preço da planilha.
 * 2. Sem preço (célula vazia ou zero) e o item JÁ EXISTE no cadastro ->
 *    NÃO zera: usa/mantém o preço existente do sistema.
 * 3. Sem preço e inexistente -> cria com valor zerado (0).
 * O custo do cadastro NUNCA é sobrescrito com 0/vazio pela importação.
 */
function custoEfetivo(custoUnitario: number, existente?: Componente): number {
  if (custoUnitario > 0) return custoUnitario
  if (existente) return Number(existente.custo_unitario) || 0
  return 0
}

/**
 * Recalcula a rolagem de custo dos nós fabricados usando o custo EFETIVO de
 * cada filho (planilha > cadastro > 0), na hora de gravar — o preview do
 * parser rola só com os preços da planilha, que podem estar vazios/zerados.
 */
function custoEfetivoNo(no: NoImportado, mapa: Map<string, Componente>): number {
  if (no.linha.tipo === 'componente_terceiros') {
    return custoEfetivo(no.linha.custoUnitario, mapa.get(no.linha.codigo.toUpperCase()))
  }
  return no.filhos.reduce((acc, f) => acc + f.linha.quantidade * custoEfetivoNo(f, mapa), 0)
}

/**
 * Anota a árvore do preview com o custo EFETIVO que será gravado (planilha >
 * cadastro > 0), para o usuário conferir antes de gravar — inclusive nos nós
 * fabricados, cujo custo rolado passa a considerar os preços herdados.
 */
export async function anotarCustosEfetivos(raizes: NoImportado[]): Promise<void> {
  const mapa = await mapaComponentes()
  const anotar = (no: NoImportado): number => {
    const existente = mapa.get(no.linha.codigo.toUpperCase())
    if (no.linha.tipo === 'componente_terceiros') {
      no.custoEfetivo = custoEfetivo(no.linha.custoUnitario, existente)
      no.custoHerdado = no.linha.custoUnitario <= 0 && (Number(existente?.custo_unitario) || 0) > 0
    } else {
      no.custoEfetivo = no.filhos.reduce((acc, f) => acc + f.linha.quantidade * anotar(f), 0)
      no.custoHerdado = no.linha.custoUnitario <= 0 && no.filhos.some((f) => f.custoHerdado)
    }
    return no.custoEfetivo
  }
  raizes.forEach(anotar)
}

/**
 * Grava o resultado da importação: cria os componentes novos (reutilizando os
 * existentes por código), cria um BOM por raiz da planilha e grava os itens
 * com parent_id, pais antes dos filhos. Em série, sem rajada de requests.
 *
 * BOM existente com o mesmo SKU: os itens da planilha são GRAVADOS e os itens
 * que já existiam são PRESERVADOS (mescla, não substituição). Um item já
 * presente na BOM (mesmo código) só é atualizado em quantidade/custo — nunca
 * apagado, e o que não vem na planilha continua lá.
 */
export async function gravarImportacaoBom(
  raizes: NoImportado[],
  onProgress?: (msg: string) => void,
): Promise<ResultadoImportacaoBom> {
  const mapa = await mapaComponentes()
  const bomsList = await bomsService.getAll()
  const bomsPorSku = new Map(bomsList.map((b) => [b.sku.toUpperCase(), b]))
  const resultado: ResultadoImportacaoBom = {
    bomsCriados: 0,
    itensCriados: 0,
    componentesReaproveitados: 0,
    componentesCriados: 0,
  }

  // Contagem de componentes para o relatório (criados x reaproveitados)
  const usados = new Set<string>()
  const coletar = (no: NoImportado) => {
    usados.add(no.linha.codigo.toUpperCase())
    no.filhos.forEach(coletar)
  }
  raizes.forEach(coletar)
  usados.forEach((cod) => {
    if (mapa.has(cod)) resultado.componentesReaproveitados++
    else resultado.componentesCriados++
  })

  let passos = 0
  const total = raizes.length

  for (const raiz of raizes) {
    const chaveSku = raiz.linha.codigo.toUpperCase()
    // Taxas zeradas por padrão quando a raiz da planilha NÃO é produto final
    // (semi-acabado, componente interno, KIT): o percentual desses é configurado
    // individualmente na Precificação. Produto final nasce com os globais.
    const taxasRaiz =
      raiz.linha.tipo === 'produto_final' ? {} : { overhead_percentual: 0, margem_percentual: 0 }
    passos++
    onProgress?.(`Gravando BOM ${passos}/${total}: ${raiz.linha.codigo}`)

    // --- BOM raiz ---------------------------------------------------------
    let bom: Bom
    if (bomsPorSku.has(chaveSku)) {
      // Mescla: mantém a BOM existente e seus itens; os da planilha entram
      // junto (o item repetido só atualiza quantidade/custo).
      bom = bomsPorSku.get(chaveSku)!
    } else {
      const criado = await bomsService.create({
        sku: raiz.linha.codigo,
        nome: raiz.linha.descricao || raiz.linha.codigo,
        categoria: raiz.linha.categoria,
        ...taxasRaiz,
      } as Omit<Bom, 'id' | 'created' | 'updated'>)
      bomsPorSku.set(chaveSku, criado)
      bom = criado
      resultado.bomsCriados++
    }

    // --- Componentes e itens ----------------------------------------------
    const existentes = await bomsService.getItems(bom.id)
    // Raiz da planilha: quando a BOM já tem item raiz gravado, atualiza-o
    // (quantidade/custo) em vez de criar um segundo item raiz.
    const raizExistente = existentes.find((it) => !it.parent_id) ?? null
    const criados = await gravarItens(bom.id, raiz, mapa, undefined, { contador: 0 }, raizExistente)
    resultado.itensCriados += criados
  }

  return resultado
}

/** Código de um item gravado, para casar item existente x item da planilha. */
function codigoItem(it: BomItem): string {
  return (it.codigo || '').toUpperCase()
}

/**
 * Grava recursivamente os itens de um nó, pais antes dos filhos.
 * `raizExistente`: quando a BOM já tinha item raiz, ele é ATUALIZADO (nunca
 * apagado nem duplicado). Itens filhos novos entram por createItem; itens já
 * existentes com o mesmo código (mesmo pai) só atualizam qtd/custo.
 * Uma falha num item NÃO aborta o resto da árvore: o erro é registrado e a
 * importação segue (antes, 1 item com problema deixava a BOM sem gravar e a
 * exclusão prévia já tinha apagado o que existia).
 */
async function gravarItens(
  bomId: string,
  no: NoImportado,
  mapa: Map<string, Componente>,
  parentId: string | undefined,
  ordemRef: { contador: number },
  raizExistente: BomItem | null,
): Promise<number> {
  const ordemCounter = ordemRef.contador
  ordemRef.contador += 1
  const linha = no.linha
  const chave = linha.codigo.toUpperCase()
  let componente = mapa.get(chave)

  if (!componente) {
    // Componente novo: custo efetivo (planilha > existente > 0) — para itens
    // novos sem preço o "existente" não existe, logo grava 0.
    componente = await componentesService.create({
      codigo: linha.codigo,
      descricao: linha.descricao,
      categoria: linha.categoria,
      unidade: linha.unidade,
      custo_unitario: custoEfetivo(linha.custoUnitario, undefined),
      fornecedor: linha.fornecedor,
      tipo: linha.tipo,
    } as Omit<Componente, 'id' | 'created' | 'updated'>)
    mapa.set(chave, componente)
  }

  // Custo do item da BOM:
  // - componente de terceiros: o custo efetivo (planilha > cadastro > 0);
  // - fabricado: rolagem dos filhos recalculada com os custos efetivos.
  const custoGravado =
    linha.tipo === 'componente_terceiros'
      ? custoEfetivo(linha.custoUnitario, componente)
      : custoEfetivoNo(no, mapa)

  // Item JÁ EXISTENTE nesta BOM com o mesmo código e o mesmo pai: atualiza
  // quantidade/custo e não cria duplicado (a raiz é o caso especial tratado
  // com raizExistente; filhos repetidos são casados por código no pai atual).
  const irmaoExistente = raizExistente && !parentId ? raizExistente : null

  const payloadItem: Omit<BomItem, 'id' | 'created' | 'updated'> = {
    bom_id: bomId,
    componente_id: componente.id,
    nivel: linha.nivel,
    ordem: ordemCounter,
    codigo: componente.codigo,
    descricao: linha.descricao,
    categoria: linha.categoria,
    unidade: linha.unidade,
    quantidade: linha.quantidade,
    custo_unitario: custoGravado,
    fornecedor: linha.fornecedor,
    item_tipo: linha.tipo,
    parent_id: parentId ?? '',
    tipo_linha: parentId ? 'submontagem' : 'componente',
  } as Omit<BomItem, 'id' | 'created' | 'updated'>

  let itemId: string
  if (irmaoExistente) {
    await bomsService.updateItem(irmaoExistente.id, payloadItem)
    itemId = irmaoExistente.id
  } else {
    const criado = await bomsService.createItem(payloadItem)
    itemId = criado.id
  }

  let total = 1
  for (const filho of no.filhos) {
    // Falha isolada: um item que não grava (payload rejeitado, por exemplo)
    // não impede os irmãos nem a subárvore dos outros nós.
    try {
      total += await gravarItens(bomId, filho, mapa, itemId, ordemRef, null)
    } catch (err) {
      console.error('Erro ao gravar item da importação:', filho.linha.codigo, err)
    }
  }
  return total
}
