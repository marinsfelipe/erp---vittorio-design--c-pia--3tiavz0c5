/// <reference path="../pb_data/types.d.ts" />
// 0033 — ZERAR TAXAS DE BOMs QUE NÃO SÃO PRODUTO ACABADO
//
// Regra de negócio decidida com o usuário: componentes de terceiros,
// semi-acabados, componentes internos e KITs NÃO têm encargo percentual —
// somente o somatório puro de custos da lista. Overhead, margem, impostos e
// comissão incidem UMA única vez, apenas no Produto acabado (markup divisor,
// ver src/utils/pricing.ts — não alterado).
//
// Critério de classificação (o mesmo do front, ver montarArvore/inferirTipoRaizBom
// em src/utils/bomTree.ts): um BOM é Produto acabado quando possui um
// bom_items raiz com item_tipo = 'produto_final' (idêntico ou ancorado pelo
// SKU); caso contrário (semi-acabado, componente interno, KIT), zera as taxas.
//
// Idempotente: em banco vazio é no-op; rodar de novo não muda nada.
migrate(
  (app) => {
    const boms = app.findRecordsByFilter('boms', '', '', 0, 0)
    for (const bom of boms) {
      // Já zerado: nada a fazer (idempotência)
      const overhead = Number(bom.get('overhead_percentual')) || 0
      const margem = Number(bom.get('margem_percentual')) || 0
      if (overhead === 0 && margem === 0) continue

      // Produto acabado = tem item raiz do tipo produto_final.
      // Sem raiz gravada, cai no fallback de categoria (KIT → KIT, senão
      // semi-acabado) — mesmo critério de inferirTipoRaizBom no front.
      let tipoRaiz = ''
      try {
        const raiz = app.findFirstRecordByFilter(
          'bom_items',
          "bom_id = {:bomId} && (parent_id = '' || parent_id = null) && item_tipo = 'produto_final'",
          { bomId: bom.id },
        )
        if (raiz) tipoRaiz = 'produto_final'
      } catch (_) {}

      if (!tipoRaiz) {
        const cat = String(bom.get('categoria') || '')
          .trim()
          .toUpperCase()
        tipoRaiz = cat === 'KIT' ? 'kit_montagem_interna' : 'produto_semi_acabado'
      }

      // Produto acabado: intocado — mantém overhead/margem atuais.
      if (tipoRaiz === 'produto_final') continue

      // Não-produto-final: zera as taxas. O override individual na
      // Precificação continua valendo: nada re-zera depois de salvo.
      bom.set('overhead_percentual', 0)
      bom.set('margem_percentual', 0)
      app.save(bom)
    }
  },
  (app) => {
    // down: no-op intencional — os valores originais não são reconstruíveis
    // com segurança; os percentuais globais seguem em `parametros`.
  },
)
