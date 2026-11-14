// 0018 — Remove TODOS os dados fictícios (seed/demo) criados pela migração
// 0002_seed_initial_data.js, preservando integralmente os dados reais.
//
// Critério de identificação dos registros fictícios: data de criação em
// 2026-11-07 19:28:15, marca temporal exata em que a migração 0002 semeou
// componentes e BOMs-piloto de demonstração (nenhum registro criado pelo
// usuário tem essa marca; os registros reais começam em 2026-11-09+).
//
// O que é REMOVIDO (apenas se pertencer ao lote do seed):
//   - 18 componentes de exemplo (CMP-0101 … GAS-1101, do catálogo demonstrativo)
//   - 3 BOMs piloto de demonstração (BAL-STR-200, VIT-APR-150, EXP-FRE-210)
//     e seus bom_items
//
// O que é PRESERVADO (não é fictício):
//   - TODOS os usuários (Feliepe/marins.felipe@yahoo.com.br, Welington Moreira,
//     Viviane dos Santos Silva) — nem login, nem senha, nem perfil são tocados
//   - Parâmetros financeiros (overhead, margem, impostos, comissão): não são
//     dados de demonstração, são configuração-base do sistema
//   - Modelo de contrato padrão (seed da 0009): documento institucional de uso
//     real, não mockado
//   - Categorias de produto (semeadas pela 0016 como backfill de categorias
//     existentes + padrões): base de uso real
//   - TODOS os BOMs/itens/propostas/clientes criados pelos usuários reais
//     (a base já não tem clientes, propostas, contratos, ordens de compra nem
//     faturamentos — essas páginas mostrarão estado vazio naturalmente)
//
// A migração é idempotente: é no-op em bancos vazios ou já limpos.
migrate(
  (app) => {
    const MARCA_SEED = '2026-11-07 19:28:15'

    // ---- 1. bom_items pertencentes aos BOMs do seed ----
    const itemsSeed = app.findRecordsByFilter(
      'bom_items',
      `created >= '${MARCA_SEED}' && created < '2026-11-07 19:28:16'`,
      '-created',
      0,
      0,
    )
    for (const it of itemsSeed) {
      app.delete(it)
    }

    // ---- 2. BOMs piloto de demonstração ----
    const bomsSeed = app.findRecordsByFilter(
      'boms',
      `created >= '${MARCA_SEED}' && created < '2026-11-07 19:28:16'`,
      '-created',
      0,
      0,
    )
    for (const b of bomsSeed) {
      app.delete(b)
    }

    // ---- 3. Componentes de exemplo (catálogo demonstrativo) ----
    // Somente os criados no lote do seed; componentes criados depois pelo
    // usuário (importação real etc.) permanecem intactos.
    const compSeed = app.findRecordsByFilter(
      'componentes',
      `created >= '${MARCA_SEED}' && created < '2026-11-07 19:28:16'`,
      '-created',
      0,
      0,
    )
    for (const c of compSeed) {
      app.delete(c)
    }
  },
  (app) => {
    // down: no-op — os dados de demonstração não voltam
  },
)
