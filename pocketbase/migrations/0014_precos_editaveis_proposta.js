/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const propostasColl = app.findCollectionByNameOrId('propostas')
    const itemsColl = app.findCollectionByNameOrId('proposta_items')

    // 1. Adicionar campos em 'proposta_items':
    // - preco_original_tabela: guarda o valor original da tabela/cálculo antes da primeira edição
    // - preco_editado: flag booleano indicando se o preço unitário foi modificado diretamente
    // - preco_editado_por: relation para users
    // - preco_editado_em: data/hora da última edição
    if (!itemsColl.fields.getByName('preco_original_tabela')) {
      itemsColl.fields.add(
        new NumberField({
          name: 'preco_original_tabela',
          min: 0,
        }),
      )
    }
    if (!itemsColl.fields.getByName('preco_editado')) {
      itemsColl.fields.add(
        new BoolField({
          name: 'preco_editado',
        }),
      )
    }
    if (!itemsColl.fields.getByName('preco_editado_por')) {
      itemsColl.fields.add(
        new RelationField({
          name: 'preco_editado_por',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        }),
      )
    }
    if (!itemsColl.fields.getByName('preco_editado_em')) {
      itemsColl.fields.add(
        new TextField({
          name: 'preco_editado_em',
        }),
      )
    }
    app.save(itemsColl)

    // 2. Criar coleção 'proposta_preco_auditoria' para histórico de edições de preço
    // RLS: vendedor vê os registros das propostas que ele criou; admin vê todos.
    // createRule: qualquer usuário autenticado que edite o preço na sua proposta.
    try {
      app.findCollectionByNameOrId('proposta_preco_auditoria')
    } catch {
      const precoAuditColl = new Collection({
        name: 'proposta_preco_auditoria',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || proposta.criador = @request.auth.id || proposta.criador = '')",
        viewRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || proposta.criador = @request.auth.id || proposta.criador = '')",
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
            required: true,
            maxSelect: 1,
            cascadeDelete: true,
          }),
          new TextField({
            name: 'item_sku',
          }),
          new TextField({
            name: 'item_nome',
          }),
          new NumberField({
            name: 'preco_anterior',
            required: true,
          }),
          new NumberField({
            name: 'preco_novo',
            required: true,
          }),
          new NumberField({
            name: 'preco_original_tabela',
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
            name: 'justificativa',
          }),
        ],
        indexes: [
          'CREATE INDEX idx_preco_audit_proposta ON proposta_preco_auditoria (proposta)',
          'CREATE INDEX idx_preco_audit_item ON proposta_preco_auditoria (item)',
          'CREATE INDEX idx_preco_audit_usuario ON proposta_preco_auditoria (usuario)',
        ],
      })
      app.save(precoAuditColl)
    }
  },
  (app) => {
    // Down migration
    try {
      const precoAudit = app.findCollectionByNameOrId('proposta_preco_auditoria')
      app.delete(precoAudit)
    } catch {}

    try {
      const itemsColl = app.findCollectionByNameOrId('proposta_items')
      if (itemsColl.fields.getByName('preco_original_tabela')) {
        itemsColl.fields.removeByName('preco_original_tabela')
      }
      if (itemsColl.fields.getByName('preco_editado')) {
        itemsColl.fields.removeByName('preco_editado')
      }
      if (itemsColl.fields.getByName('preco_editado_por')) {
        itemsColl.fields.removeByName('preco_editado_por')
      }
      if (itemsColl.fields.getByName('preco_editado_em')) {
        itemsColl.fields.removeByName('preco_editado_em')
      }
      app.save(itemsColl)
    } catch {}
  },
)
