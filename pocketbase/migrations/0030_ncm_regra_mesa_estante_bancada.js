/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0030: backfill — reclassifica BOMs com as REGRAS FIXAS atualizadas
 * (mesmas do hook `ncm_regras.pb.js`), incluindo a nova regra do usuário:
 * mesa / estante(s) / bancada(s) -> 9403.20.10 (mesma regra do mobiliário).
 * Alvos: NCM vazio OU pendente fiscal; origem 'manual' NUNCA é sobrescrita.
 * Idempotente: em execução repetida não altera nada (só grava quando muda).
 */
migrate(
  (app) => {
    function normalizar(t) {
      if (!t) return ''
      var s = String(t).toLowerCase()
      var de = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
      var para = 'aaaaaeeeeiiiiooooouuuucn'
      var out = ''
      for (var i = 0; i < s.length; i++) {
        var idx = de.indexOf(s.charAt(i))
        out += idx >= 0 ? para.charAt(idx) : s.charAt(i)
      }
      return out
    }

    var REGRAS = [
      {
        ncm: '84185090',
        rotulo: 'Refrigerador',
        termos: ['refrigerador', 'refrigerada', 'refrigerado', 'refrigeracao'],
      },
      { ncm: '84185010', rotulo: 'Freezer', termos: ['freezer'] },
      {
        ncm: '94032010',
        rotulo: 'Mobiliário',
        termos: ['mobiliario', 'mesa', 'estante', 'estantes', 'bancada', 'bancadas'],
      },
      {
        ncm: '84198920',
        rotulo: 'Vitrine aquecida / Estufa',
        termos: ['vitrine aquecida', 'estufa'],
      },
      { ncm: '94032090', rotulo: 'Vitrine neutra', termos: ['vitrine neutra'] },
      { ncm: '84198190', rotulo: 'Cocção', termos: ['coccao'] },
    ]

    // Alvos: NCM vazio OU pendente fiscal (manual preservado pelo guarda abaixo)
    var boms = []
    try {
      boms = app.findRecordsByFilter(
        'boms',
        "(ncm = '' || ncm_status = 'pendente_fiscal') && ncm_origem != 'manual'",
        'created',
        1000,
        0,
      )
    } catch (_) {
      boms = app.findRecordsByFilter('boms', '', 'created', 1000, 0)
    }
    var classificados = 0
    var semRegra = 0

    for (var i = 0; i < boms.length; i++) {
      var rec = boms[i]
      var origem = rec.getString('ncm_origem') || ''
      var ncmAtual = rec.getString('ncm') || ''
      var status = rec.getString('ncm_status') || ''

      // Guarda: manual nunca é sobrescrito; já pronto também não
      if (origem === 'manual') continue
      if (ncmAtual && status === 'pronto_nf') continue

      var partes = [
        rec.getString('nome') || '',
        rec.getString('descricao') || '',
        rec.getString('categoria') || '',
      ]
      try {
        var itens = app.findRecordsByFilter('bom_items', "bom_id = '" + rec.id + "'", '', 1000, 0)
        for (var x = 0; x < itens.length; x++) {
          partes.push(itens[x].getString('codigo') || '')
          partes.push(itens[x].getString('descricao') || '')
          partes.push(itens[x].getString('categoria') || '')
        }
      } catch (_) {}

      var txt = normalizar(partes.filter(Boolean).join(' | ')).replace(/[^a-z0-9]+/g, ' ')
      var casou = null
      var regraCasada = null
      for (var r = 0; r < REGRAS.length && !casou; r++) {
        var regra = REGRAS[r]
        for (var j = 0; j < regra.termos.length && !casou; j++) {
          var padrao = normalizar(regra.termos[j]).trim().split(/\s+/).join('\\s+')
          if (new RegExp('(^| )' + padrao, 'i').test(txt)) {
            casou = regra.termos[j]
            regraCasada = regra
          }
        }
      }

      if (casou) {
        var novoNcm = regraCasada.ncm
        var novaJustificativa = String(
          'Regra: ' + regraCasada.rotulo + ' (palavra-chave "' + casou + '")',
        ).slice(0, 500)
        if (ncmAtual === novoNcm && status === 'pronto_nf') continue
        rec.set('ncm', novoNcm)
        rec.set('ncm_origem', 'automatica')
        rec.set('ncm_confianca', 'alta')
        rec.set('ncm_status', 'pronto_nf')
        rec.set('ncm_justificativa', novaJustificativa)
        rec.set('ncm_sugerido', '')
        rec.set('ncm_classificado_em', new Date().toISOString())
        app.save(rec)
        classificados++
      } else {
        if (ncmAtual === '' && status === 'pendente_fiscal') continue
        rec.set('ncm', '')
        rec.set('ncm_origem', '')
        rec.set('ncm_status', 'pendente_fiscal')
        rec.set('ncm_justificativa', '')
        rec.set('ncm_sugerido', '')
        rec.set('ncm_confianca', '')
        rec.set('ncm_classificado_em', new Date().toISOString())
        app.save(rec)
        semRegra++
      }
    }

    console.log(
      '[NCM backfill 0030] ' +
        classificados +
        ' classificado(s), ' +
        semRegra +
        ' sem regra aplicável.',
    )
  },
  (app) => {
    // rollback: no-op (classificação é reversível pela UI; não desfeito)
  },
)
