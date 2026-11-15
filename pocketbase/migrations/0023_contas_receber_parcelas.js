/*
 * Migration 0023 — Módulo Financeiro: parcelas e condições de pagamento
 *
 * A coleção `contas_receber` já existe (criada pela migração 0022). Aqui:
 *   1. Status da parcela passa a aceitar `parcial` e `cancelado`
 *      (baixa parcial deixa a parcela em `parcial` até a quitação total).
 *   2. Seed das CONDIÇÕES DE PAGAMENTO configuráveis pelo admin na coleção
 *      `parametros`: chaves `financeiro_condicao_avista` e `financeiro_condicao_30`,
 *      `financeiro_condicao_60`, `financeiro_condicao_90`, `financeiro_condicao_120`.
 *      Para as condições parceladas, `valor_percentual` guarda o PRAZO EM DIAS do
 *      vencimento da parcela (30/60/90/120), editável pelo admin em
 *      Financeiro > Condições de Pagamento. Padrão: à vista = 0 dias.
 *
 * As chaves `financeiro_*` são administrativas e NÃO entram no markup divisor
 * (somaPercentuais/montarPercentuais as excluem explicitamente).
 */
migrate(
  (app) => {
    // --------------------------------------------------------------
    // 1. status: pendente | pago | parcial | cancelado
    // --------------------------------------------------------------
    const col = app.findCollectionByNameOrId('contas_receber')
    const statusField = col.fields.getByName('status')
    const valores = ['pendente', 'pago', 'parcial', 'cancelado']
    if (JSON.stringify(statusField.values) !== JSON.stringify(valores)) {
      statusField.values = valores
      app.save(col)
    }

    // --------------------------------------------------------------
    // 2. Condições de pagamento configuráveis (coleção parametros)
    // --------------------------------------------------------------
    const condicoes = [
      {
        chave: 'financeiro_condicao_avista',
        nome: 'À Vista (1 parcela)',
        dias: 0,
        descricao: 'Pagamento único na emissão do faturamento (vencimento = data de emissão).',
        ordem: 1,
      },
      {
        chave: 'financeiro_condicao_30',
        nome: 'Parcelado 30 dias',
        dias: 30,
        descricao: '1 parcela com vencimento em 30 dias após a emissão do faturamento.',
        ordem: 2,
      },
      {
        chave: 'financeiro_condicao_60',
        nome: 'Parcelado 30/60 dias',
        dias: 60,
        descricao: '2 parcelas: metade em 30 dias e metade em 60 dias após a emissão.',
        ordem: 3,
      },
      {
        chave: 'financeiro_condicao_90',
        nome: 'Parcelado 30/60/90 dias',
        dias: 90,
        descricao: '3 parcelas iguais em 30, 60 e 90 dias após a emissão.',
        ordem: 4,
      },
      {
        chave: 'financeiro_condicao_120',
        nome: 'Parcelado 30/60/90/120 dias',
        dias: 120,
        descricao: '4 parcelas iguais em 30, 60, 90 e 120 dias após a emissão.',
        ordem: 5,
      },
    ]

    for (const c of condicoes) {
      let existente = null
      try {
        existente = app.findFirstRecordByData('parametros', 'chave', c.chave)
      } catch (_) {
        existente = null
      }
      if (!existente) {
        const rec = new Record(app.findCollectionByNameOrId('parametros'))
        rec.set('chave', c.chave)
        rec.set('nome', c.nome)
        rec.set('valor_percentual', c.dias)
        rec.set('descricao', c.descricao)
        rec.set('ordem', c.ordem)
        app.save(rec)
      }
    }
  },
  (app) => {
    // Down: volta o status para pendente|pago e remove as condições seed
    try {
      const col = app.findCollectionByNameOrId('contas_receber')
      const statusField = col.fields.getByName('status')
      statusField.values = ['pendente', 'pago']
      app.save(col)
    } catch (_) {}
    const chaves = [
      'financeiro_condicao_avista',
      'financeiro_condicao_30',
      'financeiro_condicao_60',
      'financeiro_condicao_90',
      'financeiro_condicao_120',
    ]
    for (const chave of chaves) {
      try {
        const rec = app.findFirstRecordByData('parametros', 'chave', chave)
        if (rec) app.delete(rec)
      } catch (_) {}
    }
  },
)
