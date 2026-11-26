/// <reference path="../pb_data/types.d.ts" />
// 0035 — CORRETIVA DE 0033/0034: PREDICADO CORRETO DE "PRODUTO ACABADO"
//
// A 0034 restaurou/zerou com um predicado que não reconhecia as raízes gravadas
// pela IMPORTAÇÃO (tipo_linha = 'componente' com item_tipo = 'produto_final') e
// acabou zerando TUDO — inclusive os Produto acabado, que hoje estão 0/0
// (conferido em dados reais: nenhuma BOM com overhead/margem > 0).
//
// Critério correto (deduzido dos dados reais):
//   PRODUTO ACABADO = raiz do BOM (bom_items sem parent_id) com
//     item_tipo = 'produto_final'
//     E tipo_linha ∈ { '', 'produto_final', 'submontagem', 'componente' }
//     — 'submontagem' é como o NovaBomDialog grava a raiz de Produto acabado;
//       'componente' é como a importação grava (raiz nível 1);
//       ''/'produto_final' cobre registros antigos.
//   NÃO-FINAL = tipo_linha ∈ { 'produto_semi_acabado', 'componente_interno',
//     'kit_montagem_interna' }, ou item_tipo ≠ 'produto_final', ou sem raiz.
//
// Ação:
//   - Produto acabado com overhead/margem em 0/0: restaura os padrões LIDOS da
//     coleção `parametros` (chaves 'overhead' e 'margem_alvo' → valor_percentual;
//     sem hardcode — se a chave não existir, não restaura e registra aviso).
//   - Não-final com taxas ≠ 0: zera (idempotente — em banco já corrigido, é no-op;
//     em banco vazio, também é no-op).
migrate(
  (app) => {
    // Padrões globais lidos de `parametros` (não hardcodar)
    let overheadPadrao = 0
    let margemPadrao = 0
    try {
      const p = app.findFirstRecordByFilter('parametros', "chave = 'overhead'")
      overheadPadrao = Number(p.get('valor_percentual')) || 0
    } catch (e) {
      console.log('0035: parametro "overhead" não encontrado — não restaurará overhead')
    }
    try {
      const p = app.findFirstRecordByFilter('parametros', "chave = 'margem_alvo'")
      margemPadrao = Number(p.get('valor_percentual')) || 0
    } catch (e) {
      console.log('0035: parametro "margem_alvo" não encontrado — não restaurará margem')
    }

    const ehProdutoAcabado = (raiz) => {
      const itemTipo = String(raiz.get('item_tipo') || '')
      if (itemTipo !== 'produto_final') return false
      const tipoLinha = String(raiz.get('tipo_linha') || '')
      return (
        tipoLinha === '' ||
        tipoLinha === 'produto_final' ||
        tipoLinha === 'submontagem' ||
        tipoLinha === 'componente' ||
        tipoLinha === 'null'
      )
    }

    const boms = app.findRecordsByFilter('boms', '', '', 0, 0)
    let restaurados = 0
    let zerados = 0
    for (const bom of boms) {
      const overhead = Number(bom.get('overhead_percentual')) || 0
      const margem = Number(bom.get('margem_percentual')) || 0

      // Raiz do BOM (pode não existir — BOM sem itens)
      let raiz = null
      try {
        raiz = app.findFirstRecordByFilter(
          'bom_items',
          "bom_id = {:bomId} && (parent_id = '' || parent_id = null)",
          { bomId: bom.id },
        )
      } catch (_) {}

      if (raiz && ehProdutoAcabado(raiz)) {
        // Produto acabado: só restaura quando está 0/0 (estado que a 0033/0034
        // deixou). Admin que configurou manualmente não é sobrescrito.
        if (overhead === 0 && margem === 0 && (overheadPadrao > 0 || margemPadrao > 0)) {
          bom.set('overhead_percentual', overheadPadrao)
          bom.set('margem_percentual', margemPadrao)
          app.save(bom)
          restaurados++
        }
        continue
      }

      // Não-produto-final (ou sem raiz): taxas zeradas
      if (overhead !== 0 || margem !== 0) {
        bom.set('overhead_percentual', 0)
        bom.set('margem_percentual', 0)
        app.save(bom)
        zerados++
      }
    }
    console.log(
      '0035 concluída: ' +
        restaurados +
        ' Produto(s) acabado(s) restaurado(s) para ' +
        overheadPadrao +
        '/' +
        margemPadrao +
        ', ' +
        zerados +
        ' BOM(s) não-final(is) zerada(s)',
    )
  },
  (app) => {
    // down: no-op intencional — os valores originais não são reconstruíveis;
    // os percentuais globais seguem em `parametros`.
  },
)
