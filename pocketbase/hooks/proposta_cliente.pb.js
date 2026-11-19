/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook: PROPOSTA PARA O CLIENTE — documento limpo (sem dados internos).
 *
 * ROTA (contrato mantido — chamada no front via pb.send):
 *   GET /backend/v1/custom/propostas/{id}/para-cliente  (autenticado)
 *
 * Devolve APENAS os campos que interessam ao cliente: emissor (empresa —
 * só campos públicos), cliente, número/data da proposta, itens de venda
 * (quantidade, preço unitário de venda, desconto, total), totais, condição
 * de pagamento e prazo de entrega. NUNCA devolve custo, custo consolidado,
 * margem, markup, NCM/CEST/CFOP, impostos ou dados de fornecedor — o campo
 * nem é lido.
 *
 * Acesso: vendedor só para a própria proposta (espelha a regra da coleção
 * propostas); admin/usuário para qualquer uma.
 *
 * IMPORTANTE (JSVM): callbacks rodam em pool separado — TODA a lógica vive
 * DENTRO do callback. Rota custom: leitura apenas, sem e.next().
 */

routerAdd('GET', '/backend/v1/custom/propostas/{id}/para-cliente', (e) => {
  const app = e.app
  const info = e.requestInfo()
  const id = e.requestPathValue('id')

  // ------------------------------ autenticação -----------------------------
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
      perfil = auth.get('perfil') || ''
    } catch (_) {}
  }

  // ------------------------------- proposta --------------------------------
  let proposta = null
  try {
    proposta = app.findRecordById('propostas', String(id || ''))
  } catch (_) {
    return e.json(404, { error: 'Proposta não encontrada.' })
  }

  // Mesma regra de acesso da coleção: vendedor só a própria proposta.
  const criadorId = proposta.getString('criador') || ''
  if (perfil === 'vendedor' && criadorId !== auth.id) {
    return e.json(403, { error: 'Você só pode gerar o documento das suas próprias propostas.' })
  }

  // --------------------------------- itens ---------------------------------
  // 1 listagem única (sem rajada de requests por item).
  let itensRecs = []
  try {
    itensRecs = app.findRecordsByFilter(
      'proposta_items',
      'proposta_id = "' + String(id || '').replace(/"/g, '\\"') + '"',
      'created,sku',
      0,
      0,
    )
  } catch (_) {
    itensRecs = []
  }

  let subtotal = 0
  let totalDescontoItens = 0
  const itens = []
  for (const it of itensRecs) {
    const preco = it.getFloat('preco_unitario') || 0
    const qtd = it.getFloat('quantidade') || 0
    const tipo = it.getString('desconto_tipo') || 'valor'
    const dv = it.getFloat('desconto_valor') || 0
    let descUnit = 0
    if (dv > 0) {
      if (tipo === 'percentual') {
        descUnit = preco * (Math.min(100, dv) / 100)
      } else {
        descUnit = Math.min(preco, dv)
      }
    }
    const precoLiquido = Math.max(0, preco - descUnit)
    const descTotalItem = descUnit * qtd
    subtotal += preco * qtd
    totalDescontoItens += descTotalItem
    itens.push({
      sku: it.getString('sku') || '',
      nome_produto: it.getString('nome_produto') || '',
      quantidade: qtd,
      unidade: it.getString('unidade') || 'UN',
      preco_unitario: preco,
      desconto_tipo: tipo,
      desconto_valor: dv,
      preco_liquido: precoLiquido,
      total: precoLiquido * qtd,
    })
  }

  const subtotalAposItens = Math.max(0, subtotal - totalDescontoItens)

  // desconto geral (percentual incide sobre o subtotal após descontos de item)
  const tipoGeral = proposta.getString('desconto_tipo') || 'valor'
  const dvGeral = proposta.getFloat('desconto_valor') || 0
  let totalDescontoGeral = 0
  if (dvGeral > 0 && subtotalAposItens > 0) {
    if (tipoGeral === 'percentual') {
      totalDescontoGeral = subtotalAposItens * (Math.min(100, dvGeral) / 100)
    } else {
      totalDescontoGeral = Math.min(subtotalAposItens, dvGeral)
    }
  }

  const valorTotal =
    (proposta.getFloat('valor_total') || 0) > 0
      ? proposta.getFloat('valor_total') || 0
      : Math.max(0, subtotal - totalDescontoItens - totalDescontoGeral)

  // ------------------------- cliente (dados de venda) ----------------------
  let cliente = null
  try {
    const nome = (proposta.getString('cliente') || '').trim()
    if (nome) {
      const filtro =
        'razao_social = "' +
        nome.replace(/"/g, '\\"') +
        '" || contato = "' +
        nome.replace(/"/g, '\\"') +
        '"'
      const recs = app.findRecordsByFilter('clientes', filtro, '', 1, 0)
      if (recs.length > 0) {
        const c = recs[0]
        cliente = {
          razao_social: c.getString('razao_social') || '',
          cnpj: c.getString('cnpj') || '',
          endereco: c.getString('endereco') || '',
          cidade: c.getString('cidade') || '',
          uf: c.getString('uf') || '',
          contato: c.getString('contato') || '',
          telefone: c.getString('telefone') || '',
          email: c.getString('email') || '',
        }
      }
    }
  } catch (_) {
    cliente = null
  }

  // ------------------- emissor (empresa — só campos públicos) --------------
  let empresa = {
    razao_social: '',
    cnpj: '',
    endereco: '',
    cidade: '',
    uf: '',
    telefone: '',
    email: '',
  }
  try {
    const recs = app.findRecordsByFilter('empresa', '', '', 1, 0)
    if (recs.length > 0) {
      const emp = recs[0]
      empresa = {
        razao_social: emp.getString('razao_social') || '',
        cnpj: emp.getString('cnpj') || '',
        endereco: emp.getString('endereco') || '',
        cidade: emp.getString('cidade') || '',
        uf: emp.getString('uf') || '',
        telefone: emp.getString('telefone') || '',
        email: emp.getString('email') || '',
      }
    }
  } catch (_) {}

  // --------------------- contrato: condição e prazo ------------------------
  let condicaoPagamento = ''
  let prazoEntrega = ''
  let garantia = ''
  let contratoNumero = ''
  try {
    const contratos = app.findRecordsByFilter(
      'contratos',
      'proposta = "' + String(id || '').replace(/"/g, '\\"') + '"',
      '-created',
      1,
      0,
    )
    if (contratos.length > 0) {
      const ct = contratos[0]
      condicaoPagamento = ct.getString('condicao_pagamento') || ''
      prazoEntrega = ct.getString('prazo_entrega') || ''
      garantia = ct.getString('garantia') || ''
      contratoNumero = ct.getString('numero') || ''
    }
  } catch (_) {}

  // Fallback da condição padrão em parâmetros (mesma origem dos contratos).
  if (!condicaoPagamento) {
    try {
      const p = app.findFirstRecordByData('parametros', 'chave', 'financeiro_condicao_padrao')
      if (p) condicaoPagamento = p.getString('valor_texto') || ''
    } catch (_) {}
  }

  // ----------------------------- vendedor ----------------------------------
  let vendedor = ''
  try {
    if (criadorId) {
      const u = app.findRecordById('users', criadorId)
      vendedor = u.getString('name') || u.getString('email') || ''
    }
  } catch (_) {}

  return e.json(200, {
    empresa,
    cliente,
    cliente_fallback: proposta.getString('cliente') || '',
    proposta: {
      numero: proposta.getString('numero') || '',
      data: String(proposta.get('created') || '').slice(0, 10),
      vendedor,
      observacoes: proposta.getString('observacoes') || '',
    },
    condicao_pagamento: condicaoPagamento,
    prazo_entrega: prazoEntrega,
    garantia: garantia,
    contrato_numero: contratoNumero,
    itens,
    totais: {
      subtotal,
      total_desconto_itens: totalDescontoItens,
      total_desconto_geral: totalDescontoGeral,
      valor_total: valorTotal,
    },
  })
})
