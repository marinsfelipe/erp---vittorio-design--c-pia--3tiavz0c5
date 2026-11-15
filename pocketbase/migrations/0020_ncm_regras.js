/// <reference path="../pb_data/types.d.ts" />

/**
 * 0020 — Classificação de NCM por REGRAS FIXAS (substitui o lote por IA).
 * - Garante a coleção `ncm_lote_progresso` (progresso do lote, registro único).
 * - Limpa as sugestões pendentes da IA (origem 'sugestao'), agora obsoletas.
 */
migrate(
  (app) => {
    // 1. Coleção de progresso do lote (idempotente)
    let col = null
    try {
      col = app.findCollectionByNameOrId('ncm_lote_progresso')
    } catch (_) {
      col = null
    }
    if (!col) {
      col = new Collection({
        name: 'ncm_lote_progresso',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'estado',
            type: 'select',
            values: ['executando', 'concluido', 'erro'],
            maxSelect: 1,
          },
          { name: 'total', type: 'number' },
          { name: 'processados', type: 'number' },
          { name: 'auto_alta', type: 'number' },
          { name: 'sugestoes', type: 'number' },
          { name: 'sem_sugestao', type: 'number' },
          { name: 'erros', type: 'number' },
          { name: 'mensagem', type: 'text' },
          { name: 'iniciado_em', type: 'text' },
          { name: 'finalizado_em', type: 'text' },
        ],
      })
      app.save(col)
    }

    // 2. Registro único de progresso com id fixo (exatamente 15 caracteres — exigência do PocketBase)
    try {
      app.findRecordById('ncm_lote_progresso', 'ncmloteativo001')
    } catch (_) {
      const rec = new Record(col)
      rec.set('id', 'ncmloteativo001')
      rec.set('estado', 'concluido')
      rec.set('total', 0)
      rec.set('processados', 0)
      rec.set('auto_alta', 0)
      rec.set('sugestoes', 0)
      rec.set('sem_sugestao', 0)
      rec.set('erros', 0)
      rec.set('mensagem', '')
      app.save(rec)
    }

    // 3. Sugestões pendentes de IA (origem 'sugestao') ficam obsoletas: limpa
    //    os campos de sugestão/confiança — o produto volta a "pendente fiscal"
    //    e o lote por regras o reclassifica.
    const boms = app.findRecordsByFilter('boms', "ncm_origem = 'sugestao'", '', 100000, 0)
    for (const rec of boms) {
      rec.set('ncm', '')
      rec.set('ncm_sugerido', '')
      rec.set('ncm_origem', '')
      rec.set('ncm_confianca', '')
      rec.set('ncm_status', 'pendente_fiscal')
      rec.set('ncm_justificativa', '')
      app.save(rec)
    }
  },
  (app) => {
    // down: nada a reverter (a coleção já existia antes e sugestões apagadas
    // não são recuperáveis).
  },
)
