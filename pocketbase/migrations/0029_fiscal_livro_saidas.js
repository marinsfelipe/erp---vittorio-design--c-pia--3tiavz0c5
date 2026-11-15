/*
 * Migration 0029 — Fiscal F3 (Livro de Saídas / NF emitida).
 *
 * Campos da NF emitida pelo contador no faturamento (preenchidos pelo admin
 * no diálogo de detalhes quando a pré-nota já foi emitida):
 *   - nf_numero        (text)  — número da NF (sem série)
 *   - nf_serie         (text)  — série da NF (ex.: 1, 2, C1)
 *   - nf_data_emissao  (date)  — data de emissão da NF
 *   - nf_valor         (number)— valor TOTAL da nota emitida
 *
 * O status "emitido" do faturamento continua sendo a fonte do Livro de
 * Saídas — NF lançada aparece como "Emitido (NF xxxx/série)".
 *
 * Idempotente: re-executar não duplica campo.
 */
migrate(
  (app) => {
    const colFat = app.findCollectionByNameOrId('faturamentos')
    let faltando = false
    for (const nome of ['nf_numero', 'nf_serie', 'nf_data_emissao', 'nf_valor']) {
      let tem = false
      for (const f of colFat.fields) {
        if (f.name === nome) tem = true
      }
      if (!tem) faltando = true
    }
    if (faltando) {
      colFat.fields.add(new TextField({ name: 'nf_numero', max: 20 }))
      colFat.fields.add(new TextField({ name: 'nf_serie', max: 10 }))
      colFat.fields.add(new DateField({ name: 'nf_data_emissao' }))
      colFat.fields.add(new NumberField({ name: 'nf_valor', onlyInt: false }))
      app.save(colFat)
    }
  },
  (app) => {
    try {
      const colFat = app.findCollectionByNameOrId('faturamentos')
      colFat.fields.removeByName('nf_numero')
      colFat.fields.removeByName('nf_serie')
      colFat.fields.removeByName('nf_data_emissao')
      colFat.fields.removeByName('nf_valor')
      app.save(colFat)
    } catch (_) {}
  },
)
