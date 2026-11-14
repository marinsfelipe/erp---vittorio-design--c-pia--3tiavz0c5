import type { Bom } from '@/types/erp'
import { bomsService } from '@/services/boms'
import type {
  DecisaoImportacao,
  LinhaPrecos,
  PreviewImportacaoPrecos,
  ResultadoImportacaoPrecos,
} from '@/utils/precosImportParser'
import { validarLinhas } from '@/utils/precosImportParser'

/**
 * Classifica as linhas válidas contra a base (regras de mesclagem, chave = SKU):
 * a) produto novo → criar produto final + BOM vazio
 * b) existente sem BOM com componentes → atualizar preço + garantir BOM vazio
 * c) existente com BOM consolidado → atualizar APENAS o preço
 */
export async function classificarLinhas(linhas: LinhaPrecos[]): Promise<PreviewImportacaoPrecos> {
  const problemas = validarLinhas(linhas)
  const invalidos = new Set(problemas.map((p) => p.linha))

  const boms = await bomsService.getAll()
  const bomsPorSku = new Map(boms.map((b) => [b.sku.toUpperCase(), b]))
  const itensPorBom = new Map<string, number>()

  const validas: DecisaoImportacao[] = []
  for (const l of linhas) {
    if (invalidos.has(l.linha)) continue
    const existente = bomsPorSku.get(l.codigo.toUpperCase())

    let temBomComponentes = false
    let precoAtual: number | undefined
    let origemAtual: string | undefined

    if (existente) {
      if (!itensPorBom.has(existente.id)) {
        const itens = await bomsService.getItems(existente.id)
        itensPorBom.set(existente.id, itens.length)
      }
      temBomComponentes = (itensPorBom.get(existente.id) ?? 0) > 0
      precoAtual = Number(existente.preco_final_tabela ?? 0)
      origemAtual = existente.origem_preco
    }

    validas.push({
      linha: l,
      acao: existente ? 'atualizar' : 'criar',
      produtoExiste: Boolean(existente),
      temBomComponentes,
      // a) novo → sempre; b) existente sem componentes → cria; c) consolidado → não
      criarBomVazio: !existente || !temBomComponentes,
      precoAtual,
      origemAtual,
    })
  }

  return {
    linhas,
    validas,
    problemas,
    novos: validas.filter((d) => d.acao === 'criar'),
    atualizacoes: validas.filter((d) => d.acao === 'atualizar'),
    totalLinhas: linhas.length,
  }
}

/**
 * Grava a importação seguindo as decisões do preview. O Preço Final da planilha
 * é gravado como PREÇO FINAL PROPOSTO (origem Manual) — sem markup, sem
 * sobrepreço. Para cada linha garante também um BOM do tipo produto final SEM
 * componentes, conforme a regra de mesclagem.
 */
export async function gravarImportacaoPrecos(
  decisoes: DecisaoImportacao[],
  onProgress?: (msg: string, pct: number) => void,
): Promise<ResultadoImportacaoPrecos> {
  const resultado: ResultadoImportacaoPrecos = {
    produtosCriados: 0,
    precosAtualizados: 0,
    bomsVaziosCriados: 0,
  }

  let passos = 0
  for (const d of decisoes) {
    passos++
    const l = d.linha
    onProgress?.(
      `Gravando ${passos}/${decisoes.length}: ${l.codigo}`,
      Math.round((passos / decisoes.length) * 100),
    )

    const payloadPreco = {
      origem_preco: 'manual' as const,
      sobrepreco_tipo: 'nenhum' as const,
      sobrepreco_valor: 0,
      preco_final_tabela: l.precoFinal,
      preco_venda: l.precoFinal,
    }

    if (d.acao === 'criar') {
      // a) Produto NOVO → produto final com preço importado (origem Manual),
      //    gravado já como BOM SEM componentes (lista vazia), igual aos BOMs
      //    vazios existentes: registro em `boms` + raiz produto_final em
      //    `bom_items` (mesma forma dos BOMs vazios já criados no sistema).
      const criado = await bomsService.create({
        sku: l.codigo,
        nome: l.descricao || l.codigo,
        categoria: l.categoria,
        unidade: l.unidade,
        ...payloadPreco,
      } as Omit<Bom, 'id' | 'created' | 'updated'>)
      await bomsService.createItem({
        bom_id: criado.id,
        componente_id: '',
        nivel: 1,
        ordem: 0,
        codigo: l.codigo,
        descricao: l.descricao || l.codigo,
        categoria: l.categoria,
        unidade: l.unidade,
        quantidade: 1,
        custo_unitario: 0,
        fornecedor: 'Produção Interna',
        tipo_linha: 'submontagem',
        item_tipo: 'produto_final',
        parent_id: '',
      })
      resultado.produtosCriados++
      resultado.bomsVaziosCriados++
    } else {
      // b) e c) Produto EXISTENTE → atualizar APENAS o preço final (origem Manual).
      //    Nem estrutura, nem overhead/margem, nem flag preco_direto são tocados.
      const existente = await bomsService.getBySku(l.codigo)
      if (existente) {
        await bomsService.update(existente.id, payloadPreco)
        resultado.precosAtualizados++
        // b) "criar BOM vazio apenas se ele não existir": um BOM sem componentes
        //    JÁ É o BOM vazio — montarArvore deriva a raiz virtual dele. Nada a criar.
        // c) BOM consolidado permanece intocado.
      }
    }
  }

  return resultado
}
