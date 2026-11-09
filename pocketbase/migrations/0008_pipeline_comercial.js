migrate(
  (app) => {
    // ===== FUNCIONALIDADE 2 — PIPELINE COMERCIAL =====
    // 1. Amplia os status da coleção 'propostas' para suportar o pipeline completo:
    //    'rascunho' | 'enviada' | 'em_negociacao' | 'vendida' | 'perdida'
    // 2. Adiciona o campo 'motivo_perda' (texto) na coleção 'propostas'
    const propostas = app.findCollectionByNameOrId('propostas')

    // 1. Campo status: incluir 'em_negociacao' e 'perdida' mantendo os existentes
    const statusField = propostas.fields.getByName('status')
    if (statusField) {
      const novosValores = ['rascunho', 'enviada', 'em_negociacao', 'vendida', 'perdida']
      for (const val of novosValores) {
        if (!statusField.values.includes(val)) {
          statusField.values.push(val)
        }
      }
    }

    // 2. Campo motivo_perda: texto opcional para armazenar justificativa quando perdida
    if (!propostas.fields.getByName('motivo_perda')) {
      propostas.fields.add(
        new TextField({
          name: 'motivo_perda',
          required: false,
          max: 1000,
        }),
      )
    }

    app.save(propostas)
  },
  (app) => {
    try {
      const propostas = app.findCollectionByNameOrId('propostas')
      if (propostas.fields.getByName('motivo_perda')) {
        propostas.fields.removeByName('motivo_perda')
      }
      app.save(propostas)
    } catch (_) {}
  },
)
