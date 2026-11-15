/*
 * Migration 0027 — Fiscal: campo de texto em `parametros` + seed da lista de
 * NCMs com IPI 5% + RLS de `empresa` para admin.
 *
 *   1. Campo `valor_texto` (text) na coleção `parametros` — o hook fiscal lê
 *      `fiscal_regime` e `fiscal_ipi_ncm_5` por esse campo.
 *   2. Seeds `fiscal_regime` ('') e `fiscal_ipi_ncm_5` ('') — idempotente.
 *   3. Regras da coleção `empresa`: admin vê/edita o registro único
 *      independente de quem criou (@request.auth.perfil = 'admin').
 *
 * Idempotente: re-executar não duplica campo nem seed.
 */
migrate(
  (app) => {
    // --------------------------------------------------------------
    // 1. Campo valor_texto em `parametros`
    // --------------------------------------------------------------
    const colParam = app.findCollectionByNameOrId('parametros')
    let temTexto = false
    for (const f of colParam.fields) {
      if (f.name === 'valor_texto') temTexto = true
    }
    if (!temTexto) {
      colParam.fields.add(new TextField({ name: 'valor_texto', max: 5000 }))
      app.save(colParam)
    }

    // --------------------------------------------------------------
    // 2. Seeds fiscal_regime e fiscal_ipi_ncm_5 (vazios por padrão)
    // --------------------------------------------------------------
    const seeds = [
      {
        chave: 'fiscal_regime',
        nome: 'Regime tributário (fallback)',
        valor_texto: '',
        descricao:
          'Usado apenas se a Empresa não tiver regime definido. Valores: simples | presumido | real.',
        ordem: 0,
      },
      {
        chave: 'fiscal_ipi_ncm_5',
        nome: 'NCMs com IPI 5% (separados por vírgula)',
        valor_texto: '',
        descricao:
          'Lista de códigos NCM (8 dígitos, separados por vírgula) que recebem IPI na alíquota do parâmetro "IPI por NCM (%)".',
        ordem: 5,
      },
    ]
    for (const s of seeds) {
      let existente = null
      try {
        existente = app.findFirstRecordByData('parametros', 'chave', s.chave)
      } catch (_) {}
      if (!existente) {
        const rec = new Record(app.findCollectionByNameOrId('parametros'))
        rec.set('chave', s.chave)
        rec.set('nome', s.nome)
        rec.set('valor_percentual', 0)
        rec.set('valor_texto', s.valor_texto)
        rec.set('descricao', s.descricao)
        rec.set('ordem', s.ordem)
        app.save(rec)
      }
    }

    // --------------------------------------------------------------
    // 3. RLS de `empresa`: admin sempre pode ver/editar
    // --------------------------------------------------------------
    try {
      const colEmpresa = app.findCollectionByNameOrId('empresa')
      const regraAdmin = "@request.auth.perfil = 'admin'"
      colEmpresa.listRule = regraAdmin
      colEmpresa.viewRule = regraAdmin
      colEmpresa.createRule = regraAdmin
      colEmpresa.updateRule = regraAdmin
      colEmpresa.deleteRule = regraAdmin
      app.save(colEmpresa)
    } catch (err) {
      console.log('[0027] empresa não encontrada (0026 pendente?): ' + String(err))
    }
  },
  (app) => {
    // Down: remove os seeds e o campo valor_texto
    for (const chave of ['fiscal_regime', 'fiscal_ipi_ncm_5']) {
      try {
        const rec = app.findFirstRecordByData('parametros', 'chave', chave)
        if (rec) app.delete(rec)
      } catch (_) {}
    }
    try {
      const colParam = app.findCollectionByNameOrId('parametros')
      colParam.fields.removeByName('valor_texto')
      app.save(colParam)
    } catch (_) {}
    // Regras de empresa voltam ao padrão da 0026
    try {
      const colEmpresa = app.findCollectionByNameOrId('empresa')
      const regra = 'criador = @request.auth.id'
      colEmpresa.listRule = regra
      colEmpresa.viewRule = regra
      colEmpresa.createRule = regra
      colEmpresa.updateRule = regra
      colEmpresa.deleteRule = regra
      app.save(colEmpresa)
    } catch (_) {}
  },
)
