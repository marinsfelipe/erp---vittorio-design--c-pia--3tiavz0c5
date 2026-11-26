/// <reference path="../pb_data/types.d.ts" />
// 0034 — CORRETIVA DE 0033: CRITÉRIO CORRETO DE "PRODUTO ACABADO"
//
// A 0033 classificou como Produto acabado todo BOM cuja raiz tem
// item_tipo = 'produto_final' — mas o NovaBomDialog grava SEMPRE a raiz assim,
// mesmo para semi-acabado/componente interno/KIT (o tipo real fica em
// tipo_linha da raiz). Resultado: BOMs de Componente Interno ficaram com
// overhead/margem cheios. Esta migração refaz o trabalho com o critério
// correto: Produto acabado é o BOM cuja raiz tem item_tipo = 'produto_final'
// E tipo_linha vazio/'produto_final'/NULL; qualquer outro tipo_linha
// (componente_interno, produto_semi_acabado, kit_montagem_interna) — ou raiz
// inexistente — é tratado como não-produto-final e tem as taxas zeradas.
//
// Idempotente: em banco vazio é no-op; rodar de novo não muda nada.
migrate(
  (app) => {
    const boms = app.findRecordsByFilter('boms', '', '', 0, 0)
    for (const bom of boms) {
      const overhead = Number(bom.get('overhead_percentual')) || 0
      const margem = Number(bom.get('margem_percentual')) || 0
      if (overhead === 0 && margem === 0) continue // já zerado: no-op

      // Produto acabado = raiz com item_tipo 'produto_final' E tipo_linha
      // neutro. Sem item raiz gravado NÃO é tratado como produto acabado
      // (a 0033 fazia isso e foi o erro): zera e o admin reconfigura na
      // Precificação, caso aquela BOM precise de taxas.
      let ehProdutoAcabado = false
      try {
        const raiz = app.findFirstRecordByFilter(
          'bom_items',
          "bom_id = {:bomId} && (parent_id = '' || parent_id = null)",
          { bomId: bom.id },
        )
        if (raiz) {
          const itemTipo = String(raiz.get('item_tipo') || '')
          const tipoLinha = String(raiz.get('tipo_linha') || '')
          ehProdutoAcabado =
            itemTipo === 'produto_final' &&
            (tipoLinha === '' || tipoLinha === 'produto_final' || tipoLinha === 'null')
        }
      } catch (_) {}

      if (ehProdutoAcabado) continue // Produto acabado: taxas intocadas

      bom.set('overhead_percentual', 0)
      bom.set('margem_percentual', 0)
      app.save(bom)
    }
  },
  (app) => {
    // down: no-op intencional — valores originais não são reconstruíveis com
    // segurança; os percentuais globais seguem em `parametros`.
  },
)
