/*
 * Migration 0028 — Fiscal F2 (CFOP e CEST).
 *
 *   1. Campo `cest` (text, opcional) na coleção `boms` (produtos finais) —
 *      formato XX.XXX.XX, gravado como o admin digitar.
 *   2. Campo `cfop` (text, opcional) na coleção `faturamentos` — sugerido pelo
 *      hook fiscal (5.102/6.102, ou 5.405/6.405 com ST) e editável pelo admin.
 *   3. Seed `fiscal_st_ncm` em `parametros` (valor_texto, CSV de NCMs sujeitos
 *      a substituição tributária; padrão: 8418.50.90) — idempotente, mesmo
 *      padrão do seed fiscal_ipi_ncm_5 da 0027.
 *
 * Idempotente: re-executar não duplica campo nem seed.
 */
migrate(
  (app) => {
    // --------------------------------------------------------------
    // 1. Campo cest em `boms` (opcional — produtos finais)
    // --------------------------------------------------------------
    try {
      const colBoms = app.findCollectionByNameOrId('boms')
      let temCest = false
      for (const f of colBoms.fields) {
        if (f.name === 'cest') temCest = true
      }
      if (!temCest) {
        colBoms.fields.add(new TextField({ name: 'cest', max: 20 }))
        app.save(colBoms)
      }
    } catch (err) {
      console.log('[0028] erro no campo cest de boms: ' + String(err))
    }

    // --------------------------------------------------------------
    // 2. Campo cfop em `faturamentos` (opcional — sugerido pelo hook)
    // --------------------------------------------------------------
    try {
      const colFat = app.findCollectionByNameOrId('faturamentos')
      let temCfop = false
      for (const f of colFat.fields) {
        if (f.name === 'cfop') temCfop = true
      }
      if (!temCfop) {
        colFat.fields.add(new TextField({ name: 'cfop', max: 10 }))
        app.save(colFat)
      }
    } catch (err) {
      console.log('[0028] erro no campo cfop de faturamentos: ' + String(err))
    }

    // --------------------------------------------------------------
    // 3. Seed fiscal_st_ncm (lista CSV de NCMs com ST)
    // --------------------------------------------------------------
    let existente = null
    try {
      existente = app.findFirstRecordByData('parametros', 'chave', 'fiscal_st_ncm')
    } catch (_) {}
    if (!existente) {
      const rec = new Record(app.findCollectionByNameOrId('parametros'))
      rec.set('chave', 'fiscal_st_ncm')
      rec.set('nome', 'NCMs com substituição tributária (separados por vírgula)')
      rec.set('valor_percentual', 0)
      rec.set('valor_texto', '8418.50.90')
      rec.set(
        'descricao',
        'Lista de códigos NCM (separados por vírgula) sujeitos a SUBSTITUIÇÃO TRIBUTÁRIA. ' +
          'Ao emitir a pré-nota, o CFOP sugerido vira 5.405/6.405 e o item recebe alerta de conferência com o contador.',
      )
      rec.set('ordem', 6)
      app.save(rec)
    }
  },
  (app) => {
    // Down: remove o seed e os campos criados
    try {
      const rec = app.findFirstRecordByData('parametros', 'chave', 'fiscal_st_ncm')
      if (rec) app.delete(rec)
    } catch (_) {}
    try {
      const colBoms = app.findCollectionByNameOrId('boms')
      colBoms.fields.removeByName('cest')
      app.save(colBoms)
    } catch (_) {}
    try {
      const colFat = app.findCollectionByNameOrId('faturamentos')
      colFat.fields.removeByName('cfop')
      app.save(colFat)
    } catch (_) {}
  },
)
