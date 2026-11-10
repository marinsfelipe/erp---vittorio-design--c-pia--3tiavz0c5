/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Atualizar status da coleção 'propostas' para incluir 'aguardando_aprovacao'
    // e adicionar campos de desconto e auditoria geral
    const propostasColl = app.findCollectionByNameOrId('propostas')
    const statusField = propostasColl.fields.getByName('status')
    if (statusField) {
      statusField.values = [
        'rascunho',
        'enviada',
        'vendida',
        'em_negociacao',
        'perdida',
        'aguardando_aprovacao',
      ]
    }

    // Campos de desconto geral na proposta
    if (!propostasColl.fields.getByName('subtotal')) {
      propostasColl.fields.add(
        new NumberField({
          name: 'subtotal',
          min: 0,
        }),
      )
    }
    if (!propostasColl.fields.getByName('desconto_tipo')) {
      propostasColl.fields.add(
        new SelectField({
          name: 'desconto_tipo',
          maxSelect: 1,
          values: ['valor', 'percentual'],
        }),
      )
    }
    if (!propostasColl.fields.getByName('desconto_valor')) {
      propostasColl.fields.add(
        new NumberField({
          name: 'desconto_valor',
          min: 0,
        }),
      )
    }
    if (!propostasColl.fields.getByName('total_desconto_itens')) {
      propostasColl.fields.add(
        new NumberField({
          name: 'total_desconto_itens',
          min: 0,
        }),
      )
    }
    if (!propostasColl.fields.getByName('total_desconto_geral')) {
      propostasColl.fields.add(
        new NumberField({
          name: 'total_desconto_geral',
          min: 0,
        }),
      )
    }
    if (!propostasColl.fields.getByName('desconto_aplicado_por')) {
      propostasColl.fields.add(
        new RelationField({
          name: 'desconto_aplicado_por',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        }),
      )
    }
    if (!propostasColl.fields.getByName('desconto_aplicado_em')) {
      propostasColl.fields.add(
        new TextField({
          name: 'desconto_aplicado_em',
        }),
      )
    }
    if (!propostasColl.fields.getByName('status_anterior_aprovacao')) {
      propostasColl.fields.add(
        new TextField({
          name: 'status_anterior_aprovacao',
        }),
      )
    }
    app.save(propostasColl)

    // 2. Adicionar campos de desconto por item na coleção 'proposta_items'
    const itemsColl = app.findCollectionByNameOrId('proposta_items')
    if (!itemsColl.fields.getByName('desconto_tipo')) {
      itemsColl.fields.add(
        new SelectField({
          name: 'desconto_tipo',
          maxSelect: 1,
          values: ['valor', 'percentual'],
        }),
      )
    }
    if (!itemsColl.fields.getByName('desconto_valor')) {
      itemsColl.fields.add(
        new NumberField({
          name: 'desconto_valor',
          min: 0,
        }),
      )
    }
    if (!itemsColl.fields.getByName('preco_liquido')) {
      itemsColl.fields.add(
        new NumberField({
          name: 'preco_liquido',
          min: 0,
        }),
      )
    }
    if (!itemsColl.fields.getByName('total_desconto')) {
      itemsColl.fields.add(
        new NumberField({
          name: 'total_desconto',
          min: 0,
        }),
      )
    }
    if (!itemsColl.fields.getByName('desconto_aplicado_por')) {
      itemsColl.fields.add(
        new RelationField({
          name: 'desconto_aplicado_por',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        }),
      )
    }
    if (!itemsColl.fields.getByName('desconto_aplicado_em')) {
      itemsColl.fields.add(
        new TextField({
          name: 'desconto_aplicado_em',
        }),
      )
    }
    app.save(itemsColl)

    // 3. Criar a coleção 'proposta_desconto_auditoria' para rastreamento de auditoria (visível para admin)
    // Regras de acesso: somente admin pode listar/ler, e authenticated pode criar durante a aplicação do desconto
    try {
      app.findCollectionByNameOrId('proposta_desconto_auditoria')
    } catch {
      const auditColl = new Collection({
        name: 'proposta_desconto_auditoria',
        type: 'base',
        listRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        viewRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        createRule: "@request.auth.id != ''",
        updateRule: null,
        deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        fields: [
          new RelationField({
            name: 'proposta',
            collectionId: propostasColl.id,
            required: true,
            maxSelect: 1,
            cascadeDelete: true,
          }),
          new RelationField({
            name: 'item',
            collectionId: itemsColl.id,
            maxSelect: 1,
            cascadeDelete: false,
          }),
          new SelectField({
            name: 'tipo_alvo',
            required: true,
            maxSelect: 1,
            values: ['item', 'geral'],
          }),
          new TextField({
            name: 'item_sku',
          }),
          new TextField({
            name: 'item_nome',
          }),
          new SelectField({
            name: 'desconto_tipo',
            required: true,
            maxSelect: 1,
            values: ['valor', 'percentual'],
          }),
          new NumberField({
            name: 'desconto_valor_informado',
            required: true,
          }),
          new NumberField({
            name: 'desconto_valor_total',
            required: true,
          }),
          new NumberField({
            name: 'valor_base_anterior',
          }),
          new NumberField({
            name: 'valor_final_resultante',
          }),
          new RelationField({
            name: 'usuario',
            collectionId: '_pb_users_auth_',
            required: true,
            maxSelect: 1,
          }),
          new TextField({
            name: 'usuario_nome',
          }),
          new TextField({
            name: 'usuario_email',
          }),
          new TextField({
            name: 'observacao',
          }),
        ],
        indexes: [
          'CREATE INDEX idx_audit_proposta ON proposta_desconto_auditoria (proposta)',
          'CREATE INDEX idx_audit_usuario ON proposta_desconto_auditoria (usuario)',
        ],
      })
      app.save(auditColl)
    }

    // 4. Inserir o parâmetro default de 'limite_desconto_vendedor' se não existir
    const paramsColl = app.findCollectionByNameOrId('parametros')
    try {
      paramsColl.findFirstRecordByFilter("chave = 'limite_desconto_vendedor'")
    } catch {
      const record = new Record(paramsColl)
      record.set('chave', 'limite_desconto_vendedor')
      record.set('nome', 'Limite de Desconto do Vendedor')
      record.set('valor_percentual', 10)
      record.set(
        'descricao',
        'Percentual máximo (%) que o vendedor pode conceder sem exigir aprovação do admin',
      )
      record.set('ordem', 99)
      app.save(record)
    }
  },
  (app) => {
    // Down migration
    try {
      const audit = app.findCollectionByNameOrId('proposta_desconto_auditoria')
      app.delete(audit)
    } catch {}

    try {
      const paramsColl = app.findCollectionByNameOrId('parametros')
      const param = paramsColl.findFirstRecordByFilter("chave = 'limite_desconto_vendedor'")
      if (param) app.delete(param)
    } catch {}
  },
)
