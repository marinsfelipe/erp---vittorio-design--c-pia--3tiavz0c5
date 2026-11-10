migrate(
  (app) => {
    // ===== FUNCIONALIDADE 4 — FATURAMENTO (PRÉ-NOTA) =====
    // Coleção 'faturamentos'
    // Campos:
    // - numero: text (sequencial por ano, ex: FT-2026-0001)
    // - ano: number
    // - sequencial: number
    // - proposta: relation -> propostas
    // - proposta_numero: text
    // - cliente: relation -> clientes (opcional)
    // - cliente_razao_social: text
    // - cliente_cnpj: text
    // - cliente_ie: text
    // - cliente_endereco: text
    // - cliente_cidade: text
    // - cliente_uf: text
    // - cliente_contato: text
    // - cliente_email: text
    // - cliente_telefone: text
    // - produtos: json (array com [{ descricao, sku, quantidade, valor_unitario, valor_total }])
    // - valor_total: number
    // - status: select (pendente | emitido)
    // - data_emissao: date
    // - observacoes: text
    // - criador: relation -> users
    //
    // RLS:
    // - Admin lê/edita tudo.
    // - Vendedor lê/edita apenas registros onde criador = @request.auth.id.
    // - Vendedor cria quando criador = @request.auth.id.
    // listRule / viewRule:
    //   "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)"
    // createRule:
    //   "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)"
    // updateRule:
    //   "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)"
    // deleteRule:
    //   "@request.auth.id != '' && @request.auth.perfil = 'admin'"

    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const propostasCol = app.findCollectionByNameOrId('propostas')
    let clientesCol
    try {
      clientesCol = app.findCollectionByNameOrId('clientes')
    } catch (_) {}

    let faturamentos
    try {
      faturamentos = app.findCollectionByNameOrId('faturamentos')
    } catch (_) {
      const fields = [
        { name: 'numero', type: 'text', required: true, max: 60 },
        { name: 'ano', type: 'number', required: true },
        { name: 'sequencial', type: 'number', required: true },
        {
          name: 'proposta',
          type: 'relation',
          required: false,
          collectionId: propostasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'proposta_numero', type: 'text', max: 60 },
        { name: 'cliente_razao_social', type: 'text', required: true, max: 200 },
        { name: 'cliente_cnpj', type: 'text', max: 32 },
        { name: 'cliente_ie', type: 'text', max: 32 },
        { name: 'cliente_endereco', type: 'text', max: 300 },
        { name: 'cliente_cidade', type: 'text', max: 100 },
        { name: 'cliente_uf', type: 'text', max: 10 },
        { name: 'cliente_contato', type: 'text', max: 100 },
        { name: 'cliente_email', type: 'text', max: 150 },
        { name: 'cliente_telefone', type: 'text', max: 50 },
        { name: 'produtos', type: 'json', maxSize: 5242880 },
        { name: 'valor_total', type: 'number' },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pendente', 'emitido'],
          maxSelect: 1,
        },
        { name: 'data_emissao', type: 'date' },
        { name: 'observacoes', type: 'text', max: 2000 },
        {
          name: 'criador',
          type: 'relation',
          required: true,
          collectionId: usersCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ]

      if (clientesCol) {
        fields.splice(5, 0, {
          name: 'cliente',
          type: 'relation',
          required: false,
          collectionId: clientesCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      faturamentos = new Collection({
        name: 'faturamentos',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)",
        viewRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)",
        createRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)",
        updateRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)",
        deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        fields: fields,
        indexes: [],
      })
      app.save(faturamentos)
    }
  },
  (app) => {
    try {
      const faturamentos = app.findCollectionByNameOrId('faturamentos')
      app.delete(faturamentos)
    } catch (_) {}
  },
)
