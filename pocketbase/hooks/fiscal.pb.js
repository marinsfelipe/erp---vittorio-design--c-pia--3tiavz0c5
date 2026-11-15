/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook: FISCAL — cálculo de impostos estimados por faturamento (módulo Fiscal).
 *
 * Rota custom (somente POST, chamada do front via pb.send):
 *   POST /backend/v1/custom/fiscal/impostos
 *     body: { faturamento: "<id>" }
 *     resp: { regime, impostos: { das? | pis, cofins, icms, ipi }, total, liquido, aviso }
 *
 * Regras:
 *  - Somente admin (perfil lido em usuarios_perfil com fallback em users).
 *  - Simples Nacional: RBT12 = receita bruta dos últimos 12 meses de
 *    faturamentos 'emitido' (com menos de 12 meses, proporcionaliza:
 *    média mensal × 12) × alíquota efetiva da tabela do Anexo II (faixas
 *    editáveis em parametros, chaves fiscal_anexo2_*).
 *  - Lucro Presumido: PIS 0,65% + COFINS 3% + ICMS (interna por UF, chave
 *    fiscal_icms_uf_XX, interestadual 12%) + IPI por NCM (5% quando o NCM do
 *    SKU está na lista fiscal_ipi_ncm_5; 0% caso contrário).
 *  - ESTIMATIVA: não emite NF-e e não substitui o contador.
 */
routerAdd(
  'POST',
  '/custom/fiscal/impostos',
  (e) => {
    const app = e.app
    const info = e.requestInfo()

    // ---------------------- bloqueio no backend (admin) --------------------
    const auth = info.auth
    if (!auth) {
      return e.json(401, { error: 'Autenticação obrigatória.' })
    }
    let perfil = ''
    try {
      const p = app.findFirstRecordByData('usuarios_perfil', 'user', auth.id)
      if (p) perfil = p.getString('perfil') || ''
    } catch (_) {}
    if (!perfil) {
      try {
        perfil = auth.getString('perfil') || ''
      } catch (_) {}
    }
    if (perfil !== 'admin') {
      return e.json(403, { error: 'Módulo Fiscal restrito a administradores.' })
    }

    // ----------------------------- entrada ---------------------------------
    const body = info.body || {}
    const fatId = String(body.faturamento || '')
    if (!fatId) {
      return e.json(400, { error: 'Informe o faturamento.' })
    }

    let fat = null
    try {
      fat = app.findRecordById('faturamentos', fatId)
    } catch (_) {
      return e.json(404, { error: 'Faturamento não encontrado.' })
    }

    const valorTotal = fat.getFloat('valor_total') || 0
    const ufCliente = (fat.getString('cliente_uf') || '').toUpperCase()
    const regime = regimeEmpresa(app)

    // -------------------------- produtos / NCMs -----------------------------
    // 1 listagem única de boms (sem rajada por registro) e consulta de dados
    // dos parâmetros já carregados em memória.
    const produtos = fat.get('produtos') || []
    const skus = []
    for (const p of produtos) {
      const sku = String(p.sku || '').trim()
      if (sku) skus.push(sku)
    }
    const ncmPorSku = {}
    if (skus.length > 0) {
      try {
        const lista = app.findRecordsByFilter(
          'boms',
          'sku IN (' + skus.map((s) => "'" + s.replace(/'/g, "''") + "'").join(',') + ')',
          '',
          0,
          0,
        )
        for (const b of lista) {
          const ncm = (b.getString('ncm') || '').trim()
          if (ncm) ncmPorSku[b.getString('sku')] = ncm
        }
      } catch (_) {}
    }

    const resultado =
      regime === 'simples'
        ? calcularSimples(app, valorTotal, fat)
        : calcularPresumido(app, valorTotal, ufCliente, produtos, ncmPorSku)

    // ---- snapshot nos campos do próprio faturamento (editável pelo admin) --
    try {
      fat.set('impostos_estimados', resultado.total)
      fat.set('valor_liquido', resultado.liquido)
      fat.set('regime_tributario', regime === 'simples' ? 'simples' : 'presumido')
      fat.set('impostos_detalhe', JSON.stringify(resultado.detalhe || {}))
      app.save(fat)
    } catch (err) {
      console.log('[FISCAL] Snapshot no faturamento falhou: ' + String(err))
    }

    return e.json(200, {
      regime: regime === 'simples' ? 'Simples Nacional' : 'Lucro Presumido',
      rbt12: resultado.rbt12 || 0,
      impostos: resultado.detalhe || {},
      total: resultado.total,
      liquido: resultado.liquido,
      aviso: 'ESTIMATIVA — apuração oficial pelo contador',
    })
  },
  $requireAuth($app),
)

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function regimeEmpresa(app) {
  // Regime do cadastro da Empresa (coleção `empresa`, 1 registro; fallback:
  // parâmetro `fiscal_regime` na coleção `parametros`).
  try {
    const recs = app.findRecordsByFilter('empresa', '', '', 1, 0)
    if (recs.length > 0) return recs[0].getString('regime') || ''
  } catch (_) {}
  try {
    const p = app.findFirstRecordByData('parametros', 'chave', 'fiscal_regime')
    if (p) return p.getString('valor_texto') || ''
  } catch (_) {}
  return ''
}

function parametroNum(app, chave, padrao) {
  try {
    const p = app.findFirstRecordByData('parametros', 'chave', chave)
    if (p) {
      const v = p.getFloat('valor_percentual')
      if (!isNaN(v) && v !== 0) return v
    }
  } catch (_) {}
  return padrao
}

function calcularSimples(app, valorTotal, fat) {
  // --------------------------- RBT12 --------------------------------------
  const hoje = fat.getString('data_emissao') || new Date().toISOString().slice(0, 10)
  const limite = hoje.slice(0, 7) // AAAA-MM
  // faturamentos 'emitido' dos últimos 12 meses fechados (exclui o mês corrente)
  const receitas = []
  try {
    const lista = app.findRecordsByFilter(
      'faturamentos',
      "status = 'emitido'",
      '-data_emissao',
      0,
      0,
    )
    for (const f of lista) {
      const de = f.getString('data_emissao') || ''
      const mes = de.slice(0, 7)
      if (!mes || mes >= limite) continue
      const dentro = de >= limite.slice(0, 4) + '-01' + '-01' // >= 1º de jan do ano
      if (dentro) receitas.push(f.getFloat('valor_total') || 0)
    }
  } catch (_) {}

  // Com menos de 12 meses de histórico, proporcionaliza: média × 12.
  let rbt12 = 0
  if (receitas.length > 0) {
    const soma = receitas.reduce((a, b) => a + b, 0)
    const media = soma / Math.max(receitas.length, 1)
    rbt12 = receitas.length >= 12 ? soma : media * 12
  }

  // --------------------- tabela Anexo II (editável) ------------------------
  const faixas = lerFaixasAnexo2(app)
  const aliquotaEfetiva = aliquotaAnexo2(rbt12, faixas)

  const das = Math.round(valorTotal * (aliquotaEfetiva / 100) * 100) / 100
  const liquido = Math.round((valorTotal - das) * 100) / 100
  return { total: das, liquido, rbt12, detalhe: { DAS: das, aliqEfetiva: aliquotaEfetiva } }
}

function lerFaixasAnexo2(app) {
  // Seed padrão da tabela do Anexo II (indústria) — editável pelo admin.
  const padrao = [
    { limite: 180000, aliquota: 4.5, deducao: 0 },
    { limite: 360000, aliquota: 7.8, deducao: 5940 },
    { limite: 720000, aliquota: 10.0, deducao: 20400 },
    { limite: 1800000, aliquota: 11.2, deducao: 86400 },
    { limite: 3600000, aliquota: 14.7, deducao: 428400 },
    { limite: 4800000, aliquota: 30.0, deducao: 7214400 },
  ]
  const faixas = []
  for (let i = 1; i <= 6; i++) {
    const limite = parametroNum(app, 'fiscal_anexo2_faixa' + i + '_limite', padrao[i - 1].limite)
    const aliquota = parametroNum(
      app,
      'fiscal_anexo2_faixa' + i + '_aliquota',
      padrao[i - 1].aliquota,
    )
    const deducao = parametroNum(app, 'fiscal_anexo2_faixa' + i + '_deducao', padrao[i - 1].deducao)
    faixas.push({ limite, aliquota, deducao })
  }
  return faixas
}

function aliquotaAnexo2(rbt12, faixas) {
  for (const f of faixas) {
    if (rbt12 <= f.limite) {
      // Alíquota efetiva = (RBT12 × alíquota nominal − dedução) / RBT12
      const efetiva = (rbt12 * (f.aliquota / 100) - f.deducao) / Math.max(rbt12, 1)
      return Math.max(0, Math.round(efetiva * 10000) / 100) // % com 2 casas
    }
  }
  // Acima da última faixa: usa a última (fora do Simples).
  const last = faixas[faixas.length - 1]
  return last ? last.aliquota : 0
}

function calcularPresumido(app, valorTotal, ufCliente, produtos, ncmPorSku) {
  const pis = valorTotal * (parametroNum(app, 'fiscal_pis', 0.65) / 100)
  const cofins = valorTotal * (parametroNum(app, 'fiscal_cofins', 3.0) / 100)

  // ------------------------------ ICMS ------------------------------------
  // Interestadual: 12% (ou 4% quando destinatário contribuinte e mercadoria
  // importada — padrão aqui é 12%, configurável via fiscal_icms_interestadual).
  const isMesmaUf = ufCliente === ufEmpresa(app)
  const chaveUf = 'fiscal_icms_uf_' + (ufCliente || 'XX').toUpperCase()
  const icmsPct = isMesmaUf
    ? parametroNum(app, chaveUf, 18)
    : parametroNum(app, 'fiscal_icms_interestadual', 12)
  const icms = valorTotal * (icmsPct / 100)

  // ------------------------------- IPI -------------------------------------
  // IPI por NCM: 5% quando o NCM do produto está na lista fiscal_ipi_ncm_5
  // (texto separado por vírgula, editável pelo admin); 0% caso contrário.
  const lista5 = listaNcmIpi5(app)
  let ipi = 0
  for (const p of produtos) {
    const ncm = ncmPorSku[p.sku] || ''
    if (ncm && lista5.includes(ncm)) {
      ipi += (p.valor_total || 0) * (parametroNum(app, 'fiscal_ipi', 5) / 100)
    }
  }

  const total = Math.round((pis + cofins + icms + ipi) * 100) / 100
  const liquido = Math.round((valorTotal - total) * 100) / 100
  return {
    total,
    liquido,
    detalhe: {
      PIS: arred(pis),
      COFINS: arred(cofins),
      ICMS: arred(icms),
      IPI: arred(ipi),
      icmsPercentual: icmsPct,
      ipiPercentual: parametroNum(app, 'fiscal_ipi', 5),
    },
  }
}

function ufEmpresa(app) {
  try {
    const recs = app.findRecordsByFilter('empresa', '', '', 1, 0)
    if (recs.length > 0) return (recs[0].getString('uf') || '').toUpperCase()
  } catch (_) {}
  return ''
}

function listaNcmIpi5(app) {
  try {
    const p = app.findFirstRecordByData('parametros', 'chave', 'fiscal_ipi_ncm_5')
    if (p) {
      return (p.getString('valor_texto') || '')
        .split(',')
        .map((s) => s.trim().replace(/\D/g, ''))
        .filter(Boolean)
    }
  } catch (_) {}
  return []
}

function arred(v) {
  return Math.round(v * 100) / 100
}
