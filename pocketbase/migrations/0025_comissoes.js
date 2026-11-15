/*
 * Migration 0025 — Módulo Financeiro: Funcionalidade 4 (COMISSÕES E DRE)
 *
 * 1. Campo `percentual_comissao` (número, 0..100) em `users` e
 *    `usuarios_perfil` — preenchido APENAS pelo admin (página Usuários).
 * 2. Coleção `comissoes`: uma linha por comissão de vendedor sobre proposta
 *    vendida. Snapshot de percentual/valor_base no momento da venda.
 *    RLS: admin lê TUDO; vendedor lê apenas as próprias (vendedor = auth.id);
 *    escrita (criar/pagar/estornar) exclusiva do admin.
 * 3. Backfill idempotente: gera comissões para propostas já vendidas que
 *    ainda não tenham uma (mesma regra do hook comissoes.pb.js).
 */
migrate(
  (app) => {
    // ------------------------------------------------------------------
    // 1. Campo percentual_comissao em users e usuarios_perfil
    // ------------------------------------------------------------------
    const colecoesAlvo = ['users', 'usuarios_perfil']
    for (const nome of colecoesAlvo) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        if (col.fields.getByName('percentual_comissao')) continue
        col.fields.add(
          new NumberField({
            name: 'percentual_comissao',
            min: 0,
            max: 100,
            onlyInt: false,
          }),
        )
        app.save(col)
        console.log('[COMISSOES] Campo percentual_comissao adicionado em ' + nome)
      } catch (err) {
        console.log('[COMISSOES] Aviso ao ajustar ' + nome + ': ' + String(err))
      }
    }

    // ------------------------------------------------------------------
    // 2. Coleção comissoes
    // ------------------------------------------------------------------
    let col = null
    try {
      col = app.findCollectionByNameOrId('comissoes')
    } catch (_) {
      col = null
    }
    if (!col) {
      const usersCol = app.findCollectionByNameOrId('users')
      const propostasCol = app.findCollectionByNameOrId('propostas')
      const leitura =
        "@request.auth.id != '' && (@request.auth.perfil = 'admin' || vendedor = @request.auth.id)"
      const adminOnly = "@request.auth.id != '' && @request.auth.perfil = 'admin'"

      col = new Collection({
        name: 'comissoes',
        type: 'base',
        listRule: leitura,
        viewRule: leitura,
        createRule: adminOnly,
        updateRule: adminOnly,
        deleteRule: adminOnly,
        fields: [
          {
            name: 'vendedor',
            type: 'relation',
            required: true,
            collectionId: usersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'proposta',
            type: 'relation',
            required: false,
            collectionId: propostasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'proposta_numero', type: 'text', max: 60 },
          { name: 'cliente_nome', type: 'text', max: 200 },
          { name: 'valor_base', type: 'number' },
          { name: 'percentual', type: 'number' },
          { name: 'valor', type: 'number' },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['prevista', 'paga', 'cancelada'],
            maxSelect: 1,
          },
          { name: 'data_pagamento', type: 'date' },
          { name: 'observacoes', type: 'text', max: 1000 },
          {
            name: 'criado_por',
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
          'CREATE INDEX idx_comissoes_vendedor ON comissoes (vendedor)',
          'CREATE INDEX idx_comissoes_status ON comissoes (status)',
          'CREATE INDEX idx_comissoes_proposta ON comissoes (proposta)',
        ],
      })
      app.save(col)
    }

    // ------------------------------------------------------------------
    // 3. Backfill: comissões de propostas vendidas existentes (idempotente)
    // ------------------------------------------------------------------
    migra_backfill(app)
    function migra_backfill(app) {
      let vendidas = []
      try {
        vendidas = app.findRecordsByFilter('propostas', "status = 'vendida'", '-created', 500, 0)
      } catch (_) {
        vendidas = []
      }
      let geradas = 0
      for (const proposta of vendidas) {
        try {
          const existentes = app.findRecordsByFilter(
            'comissoes',
            "proposta = '" + proposta.id + "' && status != 'cancelada'",
            '',
            1,
            0,
          )
          if (existentes.length > 0) continue

          const criador = proposta.getString('criador') || ''
          if (!criador) continue

          const pct = percentualDe(app, criador)
          if (pct <= 0) continue

          const valorBase = proposta.getFloat('valor_total') || 0
          if (valorBase <= 0) continue

          let numero = ''
          let clienteNome = ''
          try {
            numero = proposta.getString('numero') || ''
          } catch (_) {
            numero = ''
          }
          try {
            clienteNome = proposta.getString('cliente_nome') || ''
          } catch (_) {
            clienteNome = ''
          }

          const colComissoes = app.findCollectionByNameOrId('comissoes')
          const nova = new Record(colComissoes)
          nova.set('vendedor', criador)
          nova.set('proposta', proposta.id)
          nova.set('proposta_numero', numero)
          nova.set('cliente_nome', clienteNome)
          nova.set('valor_base', valorBase)
          nova.set('percentual', pct)
          nova.set('valor', Math.round(((valorBase * pct) / 100) * 100) / 100)
          nova.set('status', 'prevista')
          nova.set('criado_por', criador)
          app.save(nova)
          geradas++
        } catch (err) {
          console.log(
            '[COMISSOES] Erro no backfill da proposta ' + proposta.id + ': ' + String(err),
          )
        }
      }
      if (geradas > 0) console.log('[COMISSOES] Backfill: ' + geradas + ' comissão(ões) gerada(s).')
    }

    function percentualDe(app, userId) {
      try {
        const p = app.findFirstRecordByData('usuarios_perfil', 'user', userId)
        if (p) {
          const v = p.getFloat('percentual_comissao')
          if (v > 0) return v
        }
      } catch (_) {}
      try {
        const u = app.findRecordById('users', userId)
        const v = u.getFloat('percentual_comissao')
        if (v > 0) return v
      } catch (_) {}
      return 0
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('comissoes')
      app.delete(col)
    } catch (_) {}
    for (const nome of ['users', 'usuarios_perfil']) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        const f = col.fields.getByName('percentual_comissao')
        if (f) {
          col.fields.remove('percentual_comissao')
          app.save(col)
        }
      } catch (_) {}
    }
  },
)
