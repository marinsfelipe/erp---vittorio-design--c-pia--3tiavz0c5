/// <reference path="../pb_data/types.d.ts" />
// 0032 — HIERARQUIA ANINHADA DE BOMs
// 1. Novo valor no select item_tipo de bom_items (e tipo de componentes):
//    kit_montagem_interna. Categoria KIT segue sendo campo texto livre.
// 2. Seed idempotente da categoria "KIT" em categorias_produto.
migrate(
  (app) => {
    const valores = [
      'produto_final',
      'produto_semi_acabado',
      'componente_interno',
      'kit_montagem_interna',
      'componente_terceiros',
    ]

    // bom_items.item_tipo: remove e recria com a lista completa (preserva dados,
    // pois os valores existentes permanecem válidos)
    const itemsCol = app.findCollectionByNameOrId('bom_items')
    if (itemsCol.fields.getByName('item_tipo')) {
      itemsCol.fields.removeByName('item_tipo')
      itemsCol.fields.add(
        new SelectField({ name: 'item_tipo', values: valores, maxSelect: 1, required: false }),
      )
      app.save(itemsCol)
    }

    // componentes.tipo: idem
    const compCol = app.findCollectionByNameOrId('componentes')
    if (compCol.fields.getByName('tipo')) {
      compCol.fields.removeByName('tipo')
      compCol.fields.add(
        new SelectField({ name: 'tipo', values: valores, maxSelect: 1, required: false }),
      )
      app.save(compCol)
    }

    // Seed idempotente da categoria KIT
    let colCategorias = null
    try {
      colCategorias = app.findCollectionByNameOrId('categorias_produto')
    } catch (_) {}
    if (colCategorias) {
      let existe = null
      try {
        existe = app.findFirstRecordByData('categorias_produto', 'nome', 'KIT')
      } catch (_) {}
      if (!existe) {
        const rec = new Record(colCategorias)
        rec.set('nome', 'KIT')
        rec.set('descricao', 'Kit montado internamente — possui lista de materiais (BOM)')
        rec.set('ativo', true)
        app.save(rec)
      }
    }
  },
  (app) => {
    // down: mantém kit_montagem_interna (remover quebraria registros existentes);
    // remove apenas a categoria KIT se nenhuma bom/componente a usar
    try {
      const usos = app.countRecords('boms', "categoria = 'KIT'")
      if (usos === 0) {
        const rec = app.findFirstRecordByData('categorias_produto', 'nome', 'KIT')
        if (rec) app.delete(rec)
      }
    } catch (_) {}
  },
)
