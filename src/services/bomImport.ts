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
 * Grava o resultado da importação: cria os componentes novos (reutilizando os
 * existentes por código), cria um BOM por raiz de nível 0 e grava os itens
 * com parent_id, pais antes dos filhos.
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
    passos++
    onProgress?.(`Gravando BOM ${passos}/${total}: ${raiz.linha.codigo}`)

    // --- BOM raiz ---------------------------------------------------------
    let bom: Bom
    if (bomsPorSku.has(chaveSku)) {
      // Reaproveita o BOM existente com o mesmo SKU e substitui seus itens
      bom = bomsPorSku.get(chaveSku)!
      const antigos = await bomsService.getItems(bom.id)
      for (const antigo of [...antigos].reverse()) {
        await bomsService.deleteItem(antigo.id)
      }
    } else {
      const criado = await bomsService.create({
        sku: raiz.linha.codigo,
        nome: raiz.linha.descricao || raiz.linha.codigo,
        categoria: raiz.linha.categoria,
      } as Omit<Bom, 'id' | 'created' | 'updated'>)
      bomsPorSku.set(chaveSku, criado)
      bom = criado
      resultado.bomsCriados++
    }

    // --- Componentes e itens ----------------------------------------------
    const criados = await gravarItens(bom.id, raiz, mapa, undefined, { contador: 0 })
    resultado.itensCriados += criados
  }

  return resultado
}

/** Grava recursivamente os itens de um nó, pais antes dos filhos. */
async function gravarItens(
  bomId: string,
  no: NoImportado,
  mapa: Map<string, Componente>,
  parentId?: string,
  ordemRef?: { contador: number },
): Promise<number> {
  const ordemCounter = ordemRef?.contador ?? 0
  if (ordemRef) ordemRef.contador = ordemCounter + 1
  const linha = no.linha
  const chave = linha.codigo.toUpperCase()
  let componente = mapa.get(chave)

  if (!componente) {
    componente = await componentesService.create({
      codigo: linha.codigo,
      descricao: linha.descricao,
      categoria: linha.categoria,
      unidade: linha.unidade,
      custo_unitario: linha.custoUnitario,
      fornecedor: linha.fornecedor,
      tipo: linha.tipo,
    } as Omit<Componente, 'id' | 'created' | 'updated'>)
    mapa.set(chave, componente)
  }

  // Custo do item: o digitado (folhas) ou o rolado dos filhos (fabricados)
  const custoGravado =
    linha.tipo === 'componente_terceiros' ? linha.custoUnitario : (no.custoRolado ?? 0)

  const item = await bomsService.createItem({
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
  } as Omit<BomItem, 'id' | 'created' | 'updated'>)

  let total = 1
  for (const filho of no.filhos) {
    total += await gravarItens(bomId, filho, mapa, item.id, ordemRef)
  }
  return total
}
