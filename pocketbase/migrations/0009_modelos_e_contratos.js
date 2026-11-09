migrate(
  (app) => {
    // ===== FUNCIONALIDADE 3 — MODELO DE CONTRATO =====
    // 1. Coleção 'modelos_contrato':
    //    Somente admin cria/edita/deleta.
    //    Leitura: usuários autenticados (admin, usuario e vendedor para poder selecionar o modelo ativo ao gerar contrato).
    //    Ou se preferir: vendedor pode listar para gerar contrato, mas NÃO pode criar/editar.
    //    O prompt diz: "Nova coleção de backend para modelos de contrato (só admin cria/edita; vendedor não acessa menu/página)".
    //    Para gerar contrato a partir da proposta vendida, vendedor precisa LER modelos ativos ou o backend/regra permite view/list para auth.
    //    listRule/viewRule: "@request.auth.id != ''"
    //    createRule/updateRule/deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'"

    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    let modelos
    try {
      modelos = app.findCollectionByNameOrId('modelos_contrato')
    } catch (_) {
      modelos = new Collection({
        name: 'modelos_contrato',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        fields: [
          { name: 'titulo', type: 'text', required: true, max: 200 },
          { name: 'descricao', type: 'text', max: 500 },
          { name: 'conteudo', type: 'text', required: true, max: 200000 },
          { name: 'ativo', type: 'bool' },
          { name: 'padrao', type: 'bool' },
          {
            name: 'criador',
            type: 'relation',
            required: false,
            collectionId: usersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_modelos_contrato_ativo ON modelos_contrato (ativo)',
          'CREATE INDEX idx_modelos_contrato_titulo ON modelos_contrato (titulo)',
        ],
      })
      app.save(modelos)
    }

    // 2. Coleção 'contratos' (contratos gerados / histórico):
    //    Campos:
    //    - numero: text (ex: CT-2026-0001)
    //    - ano: number (ex: 2026)
    //    - sequencial: number (ex: 1)
    //    - proposta: relation -> propostas
    //    - cliente: relation -> clientes (opcional se cliente for texto na proposta, mas relacionamos com clientes ou guardamos cliente_nome)
    //    - cliente_nome: text
    //    - cliente_cnpj: text
    //    - modelo: relation -> modelos_contrato (opcional)
    //    - modelo_titulo: text
    //    - conteudo: text (conteudo final preenchido)
    //    - valor_total: number
    //    - prazo_entrega: text
    //    - condicao_pagamento: text
    //    - garantia: text
    //    - criador: relation -> users
    //
    //    RLS:
    //    Admin vê todos. Vendedor lê apenas contratos dos próprios clientes/propostas (criador = @request.auth.id).
    //    listRule / viewRule:
    //      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)"
    //    createRule:
    //      "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)"
    //    updateRule / deleteRule:
    //      "@request.auth.id != '' && @request.auth.perfil = 'admin'"

    const propostasCol = app.findCollectionByNameOrId('propostas')
    let clientesCol
    try {
      clientesCol = app.findCollectionByNameOrId('clientes')
    } catch (_) {}

    let contratos
    try {
      contratos = app.findCollectionByNameOrId('contratos')
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
        { name: 'cliente_nome', type: 'text', required: true, max: 200 },
        { name: 'cliente_cnpj', type: 'text', max: 32 },
        {
          name: 'modelo',
          type: 'relation',
          required: false,
          collectionId: modelos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'modelo_titulo', type: 'text', max: 200 },
        { name: 'conteudo', type: 'text', required: true, max: 200000 },
        { name: 'valor_total', type: 'number' },
        { name: 'prazo_entrega', type: 'text', max: 120 },
        { name: 'condicao_pagamento', type: 'text', max: 200 },
        { name: 'garantia', type: 'text', max: 200 },
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

      contratos = new Collection({
        name: 'contratos',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)",
        viewRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)",
        createRule:
          "@request.auth.id != '' && (@request.auth.perfil = 'admin' || criador = @request.auth.id)",
        updateRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'admin'",
        fields: fields,
        indexes: [],
      })
      app.save(contratos)
    }

    // 3. Seed inicial de Modelo Padrão de Contrato de Fornecimento de Equipamentos de Refrigeração
    try {
      const totalModelos = app.countRecords('modelos_contrato')
      if (totalModelos === 0) {
        const modeloPadrao = new Record(modelos)
        modeloPadrao.set('titulo', 'Contrato Padrão de Venda e Instalação de Refrigeração')
        modeloPadrao.set(
          'descricao',
          'Modelo institucional da Vittorio Design para venda de balcões, câmaras e equipamentos comerciais.',
        )
        modeloPadrao.set('ativo', true)
        modeloPadrao.set('padrao', true)
        modeloPadrao.set(
          'conteudo',
          `INSTRUMENTO PARTICULAR DE COMPRA E VENDA DE EQUIPAMENTOS DE REFRIGERAÇÃO COMERCIAL

Pelo presente instrumento particular, de um lado:

CONTRATADA:
VITTORIO DESIGN REFRIGERAÇÃO COMERCIAL LTDA, inscrita no CNPJ sob o nº 12.345.678/0001-90, com sede na Rua Industrial da Refrigeração, 500, Joinville/SC, doravante denominada simplesmente CONTRATADA.

CONTRATANTE:
{{cliente}}, pessoa jurídica de direito privado, inscrita no CNPJ/MF sob o nº {{cnpj}}, com endereço em {{endereco}}, doravante denominada simplesmente CONTRATANTE.

Têm entre si justo e acordado o presente Contrato de Compra e Venda de Equipamentos de Refrigeração Comercial, que se regerá pelas cláusulas e condições seguintes:

CLÁUSULA PRIMEIRA – DO OBJETO
O presente contrato tem por objeto o fornecimento e instalação dos seguintes equipamentos e produtos fabricados/customizados pela CONTRATADA:
{{produto}}
Quantidade total de itens contratados: {{quantidade}} unidade(s).

CLÁUSULA SEGUNDA – DO VALOR E FORMA DE PAGAMENTO
Pelo fornecimento dos equipamentos descritos na Cláusula Primeira, a CONTRATANTE pagará à CONTRATADA o valor total de {{valor_total}} ({{valor_extenso}}).
Parágrafo Único: A condição de pagamento ajustada entre as partes é: {{condicao_pagamento}}.

CLÁUSULA TERCEIRA – DO PRAZO E LOCAL DE ENTREGA
Os equipamentos descritos na Cláusula Primeira serão entregues e disponibilizados no endereço da CONTRATANTE no prazo de {{prazo_entrega}}, contado a partir da confirmação do sinal ou aprovação do presente instrumento.

CLÁUSULA QUARTA – DA GARANTIA E ASSISTÊNCIA TÉCNICA
A CONTRATADA concede ao CONTRATANTE a garantia contra defeitos de fabricação de {{garantia}}, abrangendo componentes de estrutura, refrigeração e montagem mecânica, ressalvados casos de mau uso, oscilações severas de tensão elétrica ou intervenção de terceiros não autorizados.

CLÁUSULA QUINTA – DO FORO
Para dirimir quaisquer controvérsias oriundas do presente instrumento, as partes elegem o Foro da Comarca da sede da CONTRATADA, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

E por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma.

Data: ____/____/________


_________________________________________________
VITTORIO DESIGN REFRIGERAÇÃO COMERCIAL LTDA
CONTRATADA


_________________________________________________
{{cliente}}
CONTRATANTE`,
        )
        app.save(modeloPadrao)
      }
    } catch (e) {
      console.log('Aviso ao semear modelo padrao:', e)
    }
  },
  (app) => {
    try {
      const contratos = app.findCollectionByNameOrId('contratos')
      app.delete(contratos)
    } catch (_) {}

    try {
      const modelos = app.findCollectionByNameOrId('modelos_contrato')
      app.delete(modelos)
    } catch (_) {}
  },
)
