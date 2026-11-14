/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0019: Classificação automática de NCM (IA) dos produtos.
 *
 * 1. Novos campos na coleção `boms` (produtos finais e avulsos):
 *    - ncm: text (código NCM de 8 dígitos; vazio = sem NCM)
 *    - ncm_origem: select (manual | automatica | sugestao)
 *      * manual      = definido pelo admin (NUNCA sobrescrito pela automação)
 *      * automatica  = gravado pela IA com confiança ALTA ("Pronto para NF")
 *      * sugestao    = sugestão da IA (confiança MÉDIA/BAIXA) aguardando confirmação
 *    - ncm_sugerido: text (código de 8 dígitos sugerido pela IA)
 *    - ncm_confianca: select (alta | media | baixa)
 *    - ncm_justificativa: text (motivo curto da classificação)
 *    - ncm_status: select (pronto_nf | pendente_fiscal)
 *    - ncm_classificado_em: date (data do processamento automático)
 *
 * 2. Coleção `ncm_lote_progresso` (registro único com id fixo 'ativo') que guarda
 *    o progresso do lote em segundo plano e o resumo final.
 *
 * 3. Agente nativo Skip Cloud 'classificador-ncm' (persistente, $ai.agents.define)
 *    que analisa descrição + categoria (+ componentes do BOM informados no prompt)
 *    e devolve SEMPRE JSON com NCM de 8 dígitos, confiança e justificativa.
 *
 * A importação de NCM via planilha NÃO é alterada: o que for executado por último
 * prevalece (importação grava ncm/ncm_origem='manual'; a automação ignora origem manual).
 */

migrate(
  (app) => {
    const bomsCol = app.findCollectionByNameOrId('boms')

    if (!bomsCol.fields.getByName('ncm')) {
      bomsCol.fields.add(
        new TextField({
          name: 'ncm',
          max: 20,
        }),
      )
    }

    if (!bomsCol.fields.getByName('ncm_origem')) {
      bomsCol.fields.add(
        new SelectField({
          name: 'ncm_origem',
          maxSelect: 1,
          values: ['manual', 'automatica', 'sugestao'],
        }),
      )
    }

    if (!bomsCol.fields.getByName('ncm_sugerido')) {
      bomsCol.fields.add(
        new TextField({
          name: 'ncm_sugerido',
          max: 20,
        }),
      )
    }

    if (!bomsCol.fields.getByName('ncm_confianca')) {
      bomsCol.fields.add(
        new SelectField({
          name: 'ncm_confianca',
          maxSelect: 1,
          values: ['alta', 'media', 'baixa'],
        }),
      )
    }

    if (!bomsCol.fields.getByName('ncm_justificativa')) {
      bomsCol.fields.add(
        new TextField({
          name: 'ncm_justificativa',
          max: 500,
        }),
      )
    }

    if (!bomsCol.fields.getByName('ncm_status')) {
      bomsCol.fields.add(
        new SelectField({
          name: 'ncm_status',
          maxSelect: 1,
          values: ['pronto_nf', 'pendente_fiscal'],
        }),
      )
    }

    if (!bomsCol.fields.getByName('ncm_classificado_em')) {
      bomsCol.fields.add(
        new DateField({
          name: 'ncm_classificado_em',
        }),
      )
    }

    app.save(bomsCol)

    // ---- Coleção de progresso do lote (registro único 'ativo') ----
    let progCol
    try {
      progCol = app.findCollectionByNameOrId('ncm_lote_progresso')
    } catch (_) {
      progCol = new Collection({
        name: 'ncm_lote_progresso',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'estado', type: 'text', max: 30 }, // executando | concluido | erro
          { name: 'total', type: 'number' },
          { name: 'processados', type: 'number' },
          { name: 'auto_alta', type: 'number' },
          { name: 'sugestoes', type: 'number' },
          { name: 'sem_sugestao', type: 'number' },
          { name: 'erros', type: 'number' },
          { name: 'mensagem', type: 'text', max: 300 },
          { name: 'iniciado_em', type: 'date' },
          { name: 'finalizado_em', type: 'date' },
        ],
      })
      app.save(progCol)
    }

    // ---- Agente nativo Skip Cloud (redefinição determinística) ----
    try {
      $ai.agents.delete(app, 'classificador-ncm')
    } catch (_) {}

    $ai.agents.define(app, {
      slug: 'classificador-ncm',
      name: 'Classificador Fiscal NCM',
      description:
        'Sugere o código NCM de 8 dígitos para produtos industriais a partir da descrição, categoria e componentes.',
      tier: 'fast',
      memory: [],
      systemPrompt: `Você é um classificador fiscal especialista em NCM (Nomenclatura Comum do Mercosul) para notas fiscais brasileiras.

Recebe, em JSON: { "sku", "nome", "descricao", "categoria", "componentes": [...] }.
"componentes" (quando presente) lista os itens do BOM do produto, para ajudar a entender a natureza física do produto.

Sua tarefa: sugerir o código NCM de EXATAMENTE 8 dígitos mais adequado ao produto acabado (não dos componentes).

Regras:
- O campo "ncm" deve conter SEMPRE exatamente 8 dígitos numéricos (ex.: "84185010"). Sem pontos, sem hífen, sem letras.
- Escolha o capítulo/posição/subitem que melhor corresponde ao produto acabado, considerando função e material.
- "confianca" deve ser "alta" apenas quando a classificação for inequívoca; "media" quando houver pouca dúvida; "baixa" quando o produto for ambíguo ou incomum.
- "justificativa": texto CURTO em português (1 frase, máx. ~160 caracteres) explicando por que classificou assim.
- FIDELIDADE: baseie-se apenas na descrição, categoria e componentes informados. Nunca invente características que não estão lá. Se os dados forem insuficientes para qualquer sugestão, use ncm "" e confianca "baixa".
- Não use ferramentas para alterar registros: apenas analise e responda.

Retorne SOMENTE JSON cru (sem markdown, sem crases), exatamente neste formato:
{"ncm":"84185010","confianca":"alta","justificativa":"Vitrine refrigerada de exposição de alimentos, classificada como equipamento frigorífico comercial."}`,
      tools: [],
    })
  },
  (app) => {
    // Rollback: remove o agente, a coleção de progresso e os campos adicionados
    try {
      $ai.agents.delete(app, 'classificador-ncm')
    } catch (_) {}

    try {
      const col = app.findCollectionByNameOrId('ncm_lote_progresso')
      app.delete(col)
    } catch (_) {}

    const bomsCol = app.findCollectionByNameOrId('boms')
    const nomes = [
      'ncm',
      'ncm_origem',
      'ncm_sugerido',
      'ncm_confianca',
      'ncm_justificativa',
      'ncm_status',
      'ncm_classificado_em',
    ]
    for (const n of nomes) {
      if (bomsCol.fields.getByName(n)) bomsCol.fields.removeByName(n)
    }
    app.save(bomsCol)
  },
)
