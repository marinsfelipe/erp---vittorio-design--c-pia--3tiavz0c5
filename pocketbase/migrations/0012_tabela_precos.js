/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0012: Funcionalidade 2 — Módulo Tabela de Preços.
 *
 * Adiciona à coleção `boms` (produtos finais e avulsos):
 * - origem_preco: select (calculado | sobrepreco | manual | preco_direto)
 * - sobrepreco_tipo: select (nenhum | percentual | valor)
 * - sobrepreco_valor: number
 * - preco_final_tabela: number
 *
 * Permissões:
 * - Leitura: vendedor pode ler produtos avulsos ou ler itens com preco_venda/preco_final_tabela
 *   (para consultar catálogo e propostas), mas NÃO vê custos nem pode acessar gestão da tabela.
 * - Edição da tabela de preços: restrita a admin.
 */

migrate(
  (app) => {
    const bomsCol = app.findCollectionByNameOrId('boms')

    // 1. origem_preco: select ('calculado', 'sobrepreco', 'manual', 'preco_direto')
    if (!bomsCol.fields.getByName('origem_preco')) {
      bomsCol.fields.add(
        new SelectField({
          name: 'origem_preco',
          maxSelect: 1,
          values: ['calculado', 'sobrepreco', 'manual', 'preco_direto'],
        }),
      )
    }

    // 2. sobrepreco_tipo: select ('nenhum', 'percentual', 'valor')
    if (!bomsCol.fields.getByName('sobrepreco_tipo')) {
      bomsCol.fields.add(
        new SelectField({
          name: 'sobrepreco_tipo',
          maxSelect: 1,
          values: ['nenhum', 'percentual', 'valor'],
        }),
      )
    }

    // 3. sobrepreco_valor: number
    if (!bomsCol.fields.getByName('sobrepreco_valor')) {
      bomsCol.fields.add(
        new NumberField({
          name: 'sobrepreco_valor',
        }),
      )
    }

    // 4. preco_final_tabela: number
    if (!bomsCol.fields.getByName('preco_final_tabela')) {
      bomsCol.fields.add(
        new NumberField({
          name: 'preco_final_tabela',
        }),
      )
    }

    app.save(bomsCol)
  },
  (app) => {
    const bomsCol = app.findCollectionByNameOrId('boms')
    if (bomsCol.fields.getByName('origem_preco')) bomsCol.fields.removeByName('origem_preco')
    if (bomsCol.fields.getByName('sobrepreco_tipo')) bomsCol.fields.removeByName('sobrepreco_tipo')
    if (bomsCol.fields.getByName('sobrepreco_valor'))
      bomsCol.fields.removeByName('sobrepreco_valor')
    if (bomsCol.fields.getByName('preco_final_tabela'))
      bomsCol.fields.removeByName('preco_final_tabela')
    app.save(bomsCol)
  },
)
