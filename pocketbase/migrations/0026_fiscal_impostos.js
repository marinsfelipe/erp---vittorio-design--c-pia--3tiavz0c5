/*
 * Migration 0026 — Módulo Fiscal (Funcionalidade 1): impostos estimados por regime
 *
 *   1. Nova coleção `empresa` (1 registro, admin-only): razao_social, cnpj,
 *      endereco, cidade, uf, regime (simples | presumido | real), ie, email,
 *      telefone — base do regime tributário usado nos cálculos.
 *   2. Novos campos em `faturamentos`: impostos_estimados, valor_liquido,
 *      regime_tributario e impostos_detalhe (snapshot do cálculo).
 *   3. Parâmetros fiscais editáveis na coleção `parametros` (mesmo padrão das
 *      chaves financeiro_*): faixas do Anexo II (Simples), PIS/COFINS, ICMS por
 *      UF, ICMS interestadual, IPI por NCM. NÃO entram no markup divisor.
 *
 * Cálculo estimativo apenas — o sistema não emite NF-e.
 */
migrate(
  (app) => {
    // --------------------------------------------------------------
    // 1. Coleção `empresa`
    // --------------------------------------------------------------
    let colEmpresa = null
    try {
      colEmpresa = app.findCollectionByNameOrId('empresa')
    } catch (_) {
      colEmpresa = null
    }
    if (!colEmpresa) {
      colEmpresa = new Collection({
        name: 'empresa',
        type: 'base',
        listRule: 'criador = @request.auth.id',
        viewRule: 'criador = @request.auth.id',
        createRule: 'criador = @request.auth.id',
        updateRule: 'criador = @request.auth.id',
        deleteRule: 'criador = @request.auth.id',
        fields: [
          {
            name: 'criador',
            type: 'relation',
            required: true,
            collectionId: 'users',
            maxSelect: 1,
          },
          { name: 'razao_social', type: 'text', required: true },
          { name: 'cnpj', type: 'text' },
          { name: 'ie', type: 'text' },
          { name: 'endereco', type: 'text' },
          { name: 'cidade', type: 'text' },
          { name: 'uf', type: 'text', max: 2 },
          { name: 'email', type: 'text' },
          { name: 'telefone', type: 'text' },
          {
            name: 'regime',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['simples', 'presumido', 'real'],
          },
        ],
      })
      app.save(colEmpresa)
    }

    // --------------------------------------------------------------
    // 2. Novos campos em `faturamentos`
    // --------------------------------------------------------------
    const colFat = app.findCollectionByNameOrId('faturamentos')
    const nomesExistentes = []
    for (const f of colFat.fields) nomesExistentes.push(f.name)

    const novosCampos = [
      { name: 'impostos_estimados', type: 'number', onlyIfMissing: true },
      { name: 'valor_liquido', type: 'number', onlyIfMissing: true },
      {
        name: 'regime_tributario',
        type: 'select',
        onlyIfMissing: true,
        maxSelect: 1,
        values: ['simples', 'presumido', 'real'],
      },
      { name: 'impostos_detalhe', type: 'text', onlyIfMissing: true },
    ]
    for (const f of novosCampos) {
      if (!nomesExistentes.includes(f.name)) {
        colFat.fields.add(new Field(f))
      }
    }
    app.save(colFat)

    // --------------------------------------------------------------
    // 3. Parâmetros fiscais (seed) — NÃO entram no markup divisor
    // --------------------------------------------------------------
    const seed = [
      // Faixas do Anexo II (Simples Nacional — indústria). valor_percentual =
      // alíquota nominal (%); ordem = limite superior da faixa (RBT12, R$).
      {
        chave: 'fiscal_anexo2_faixa1_limite',
        nome: 'Anexo II — Limite faixa 1 (R$)',
        valor: 180000,
        descricao: 'RBT12 até este valor usa esta faixa.',
        ordem: 180000,
      },
      {
        chave: 'fiscal_anexo2_faixa1_aliquota',
        nome: 'Anexo II — Alíquota faixa 1 (%)',
        valor: 4.5,
        descricao: 'Alíquota nominal da faixa 1.',
        ordem: 1,
      },
      {
        chave: 'fiscal_anexo2_faixa1_deducao',
        nome: 'Anexo II — Dedução faixa 1 (R$)',
        valor: 0,
        descricao: 'Parcela a deduzir da faixa 1.',
        ordem: 0,
      },
      {
        chave: 'fiscal_anexo2_faixa2_limite',
        nome: 'Anexo II — Limite faixa 2 (R$)',
        valor: 360000,
        descricao: 'RBT12 até este valor usa esta faixa.',
        ordem: 360000,
      },
      {
        chave: 'fiscal_anexo2_faixa2_aliquota',
        nome: 'Anexo II — Alíquota faixa 2 (%)',
        valor: 7.8,
        descricao: 'Alíquota nominal da faixa 2.',
        ordem: 2,
      },
      {
        chave: 'fiscal_anexo2_faixa2_deducao',
        nome: 'Anexo II — Dedução faixa 2 (R$)',
        valor: 5940,
        descricao: 'Parcela a deduzir da faixa 2.',
        ordem: 5940,
      },
      {
        chave: 'fiscal_anexo2_faixa3_limite',
        nome: 'Anexo II — Limite faixa 3 (R$)',
        valor: 720000,
        descricao: 'RBT12 até este valor usa esta faixa.',
        ordem: 720000,
      },
      {
        chave: 'fiscal_anexo2_faixa3_aliquota',
        nome: 'Anexo II — Alíquota faixa 3 (%)',
        valor: 10.0,
        descricao: 'Alíquota nominal da faixa 3.',
        ordem: 3,
      },
      {
        chave: 'fiscal_anexo2_faixa3_deducao',
        nome: 'Anexo II — Dedução faixa 3 (R$)',
        valor: 20400,
        descricao: 'Parcela a deduzir da faixa 3.',
        ordem: 20400,
      },
      {
        chave: 'fiscal_anexo2_faixa4_limite',
        nome: 'Anexo II — Limite faixa 4 (R$)',
        valor: 1800000,
        descricao: 'RBT12 até este valor usa esta faixa.',
        ordem: 4,
      },
      {
        chave: 'fiscal_anexo2_faixa4_aliquota',
        nome: 'Anexo II — Alíquota faixa 4 (%)',
        valor: 11.2,
        descricao: 'Alíquota nominal da faixa 4.',
        ordem: 11.2,
      },
      {
        chave: 'fiscal_anexo2_faixa4_deducao',
        nome: 'Anexo II — Dedução faixa 4 (R$)',
        valor: 86400,
        descricao: 'Parcela a deduzir da faixa 4.',
        ordem: 86400,
      },
      {
        chave: 'fiscal_anexo2_faixa5_limite',
        nome: 'Anexo II — Limite faixa 5 (R$)',
        valor: 3600000,
        descricao: 'RBT12 até este valor usa esta faixa.',
        ordem: 5,
      },
      {
        chave: 'fiscal_anexo2_faixa5_aliquota',
        nome: 'Anexo II — Alíquota faixa 5 (%)',
        valor: 14.7,
        descricao: 'Alíquota nominal da faixa 5.',
        ordem: 14.7,
      },
      {
        chave: 'fiscal_anexo2_faixa5_deducao',
        nome: 'Anexo II — Dedução faixa 5 (R$)',
        valor: 428400,
        descricao: 'Parcela a deduzir da faixa 5.',
        ordem: 428400,
      },
      {
        chave: 'fiscal_anexo2_faixa6_limite',
        nome: 'Anexo II — Limite faixa 6 (R$)',
        valor: 4800000,
        descricao: 'RBT12 até este valor usa esta faixa.',
        ordem: 6,
      },
      {
        chave: 'fiscal_anexo2_faixa6_aliquota',
        nome: 'Anexo II — Alíquota faixa 6 (%)',
        valor: 30.0,
        descricao: 'Alíquota nominal da faixa 6.',
        ordem: 30.0,
      },
      {
        chave: 'fiscal_anexo2_faixa6_deducao',
        nome: 'Anexo II — Dedução faixa 6 (R$)',
        valor: 7214400,
        descricao: 'Parcela a deduzir da faixa 6.',
        ordem: 7214400,
      },
      // Lucro Presumido
      {
        chave: 'fiscal_pis',
        nome: 'PIS (%)',
        valor: 0.65,
        descricao: 'Alíquota estimada de PIS (Lucro Presumido).',
        ordem: 1,
      },
      {
        chave: 'fiscal_cofins',
        nome: 'COFINS (%)',
        valor: 3.0,
        descricao: 'Alíquota estimada de COFINS (Lucro Presumido).',
        ordem: 2,
      },
      {
        chave: 'fiscal_icms_interestadual',
        nome: 'ICMS interestadual (%)',
        valor: 12,
        descricao: 'Alíquota interestadual padrão (12%).',
        ordem: 3,
      },
      {
        chave: 'fiscal_ipi',
        nome: 'IPI por NCM (%)',
        valor: 5,
        descricao: 'Alíquota de IPI aplicada quando o NCM do produto está na lista abaixo.',
        ordem: 4,
      },
      // ICMS interno por UF — alíquota interna configurável por estado
      {
        chave: 'fiscal_icms_uf_ac',
        nome: 'ICMS interno AC (%)',
        valor: 17,
        descricao: 'Alíquota interna de ICMS no Acre.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_al',
        nome: 'ICMS interno AL (%)',
        valor: 17,
        descricao: 'Alíquota interna de ICMS em Alagoas.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_am',
        nome: 'ICMS interno AM (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS no Amazonas.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_ap',
        nome: 'ICMS interno AP (%)',
        valor: 12,
        descricao: 'Alíquota interna de ICMS no Amapá.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_ba',
        nome: 'ICMS interno BA (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS na Bahia.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_ce',
        nome: 'ICMS interno CE (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS no Ceará.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_df',
        nome: 'ICMS interno DF (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS no Distrito Federal.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_es',
        nome: 'ICMS interno ES (%)',
        valor: 17,
        descricao: 'Alíquota interna de ICMS no Espírito Santo.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_go',
        nome: 'ICMS interno GO (%)',
        valor: 17,
        descricao: 'Alíquota interna de ICMS em Goiás.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_ma',
        nome: 'ICMS interno MA (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS no Maranhão.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_mg',
        nome: 'ICMS interno MG (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS em Minas Gerais.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_ms',
        nome: 'ICMS interno MS (%)',
        valor: 17,
        descricao: 'Alíquota interna de ICMS em Mato Grosso do Sul.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_mt',
        nome: 'ICMS interno MT (%)',
        valor: 17,
        descricao: 'Alíquota interna de ICMS em Mato Grosso.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_pa',
        nome: 'ICMS interno PA (%)',
        valor: 17,
        descricao: 'Alíquota interna de ICMS no Pará.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_pb',
        nome: 'ICMS interno PB (%)',
        valor: 17,
        descricao: 'Alíquota interna de ICMS na Paraíba.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_pe',
        nome: 'ICMS interno PE (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS em Pernambuco.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_pi',
        nome: 'ICMS interno PI (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS no Piauí.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_pr',
        nome: 'ICMS interno PR (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS no Paraná.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_rj',
        nome: 'ICMS interno RJ (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS no Rio de Janeiro.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_rn',
        nome: 'ICMS interno RN (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS no Rio Grande do Norte.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_ro',
        nome: 'ICMS interno RO (%)',
        valor: 17.5,
        descricao: 'Alíquota interna de ICMS em Rondônia.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_rr',
        nome: 'ICMS interno RR (%)',
        valor: 17,
        descricao: 'Alíquota interna de ICMS em Roraima.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_rs',
        nome: 'ICMS interno RS (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS no Rio Grande do Sul.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_sc',
        nome: 'ICMS interno SC (%)',
        valor: 17,
        descricao: 'Alíquota interna de ICMS em Santa Catarina.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_se',
        nome: 'ICMS interno SE (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS em Sergipe.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_sp',
        nome: 'ICMS interno SP (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS em São Paulo.',
        ordem: 1,
      },
      {
        chave: 'fiscal_icms_uf_to',
        nome: 'ICMS interno TO (%)',
        valor: 18,
        descricao: 'Alíquota interna de ICMS no Tocantins.',
        ordem: 1,
      },
    ]
    for (const s of seed) {
      let existente = null
      try {
        existente = app.findFirstRecordByData('parametros', 'chave', s.chave)
      } catch (_) {}
      if (!existente) {
        const rec = new Record(app.findCollectionByNameOrId('parametros'))
        rec.set('chave', s.chave)
        rec.set('nome', s.nome)
        rec.set('valor_percentual', s.valor)
        rec.set('descricao', s.descricao)
        rec.set('ordem', s.ordem)
        app.save(rec)
      }
    }
  },
  (app) => {
    // Down: remove parâmetros fiscais e campos do faturamento
    const chaves = []
    for (let i = 1; i <= 6; i++) {
      chaves.push(
        'fiscal_anexo2_faixa' + i + '_limite',
        'fiscal_anexo2_faixa' + i + '_aliquota',
        'fiscal_anexo2_faixa' + i + '_deducao',
      )
    }
    chaves.push('fiscal_pis', 'fiscal_cofins', 'fiscal_icms_interestadual', 'fiscal_ipi')
    const ufs = [
      'ac',
      'al',
      'am',
      'ap',
      'ba',
      'ce',
      'df',
      'es',
      'go',
      'ma',
      'mg',
      'ms',
      'mt',
      'pa',
      'pb',
      'pe',
      'pi',
      'pr',
      'rj',
      'rn',
      'ro',
      'rr',
      'rs',
      'sc',
      'se',
      'sp',
      'to',
    ]
    for (const uf of ufs) chaves.push('fiscal_icms_uf_' + uf)
    for (const chave of chaves) {
      try {
        const rec = app.findFirstRecordByData('parametros', 'chave', chave)
        if (rec) app.delete(rec)
      } catch (_) {}
    }
    try {
      const colFat = app.findCollectionByNameOrId('faturamentos')
      for (const nome of [
        'impostos_estimados',
        'valor_liquido',
        'regime_tributario',
        'impostos_detalhe',
      ]) {
        try {
          colFat.fields.removeByName(nome)
        } catch (_) {}
      }
      app.save(colFat)
    } catch (_) {}
  },
)
