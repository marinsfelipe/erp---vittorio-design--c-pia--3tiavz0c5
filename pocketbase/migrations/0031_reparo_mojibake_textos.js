/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0031: reparo de mojibake em textos importados (componentes,
 * boms, bom_items).
 *
 * Causa: planilhas CSV salvas em windows-1252 foram lidas como UTF-8 no
 * importador; cada byte acentuado (é, ç, ã…) virou U+FFFD ("�"). O padrão é
 * ambíguo (não dá para reconstruir a letra original genericamente), então o
 * reparo usa uma tabela de substituições conhecidas — palavras reais dos
 * registros corrompidos (códigos CP*) mais os padrões seguros de português.
 *
 * Idempotente: só grava quando algo de fato muda; no-op em banco vazio.
 * NUNCA toca em texto sem U+FFFD (texto correto é preservado intacto).
 */
migrate(
  (app) => {
    // Pares [contendo "�", correto]. A ordem importa: padrões mais longos
    // primeiro. Case-sensitive — versões com maiúscula listadas separadamente.
    var REPAROS = [
      // Padrões seguros de português: "��o" = consoante perdida + ã + o,
      // e a única consoante não-ASCII é "ç" => "ção". Idem "��es" => "ções".
      ['��o', 'ção'],
      ['��es', 'ções'],
      // Palavras reais encontradas nos registros corrompidos
      ['Jacar�', 'Jacaré'],
      ['M�dia', 'Média'],
      ['Tungst�nio', 'Tungstênio'],
      ['A�o', 'Aço'],
      ['a�o inox', 'aço inox'],
      ['G�s', 'Gás'],
      ['Ma�arico', 'Maçarico'],
      ['Ilumina��o', 'Iluminação'],
      ['ilumina��o', 'iluminação'],
      ['Cer�mica', 'Cerâmica'],
      ['Lumin�ria', 'Luminária'],
      ['El�trica', 'Elétrica'],
      ['el�trica', 'elétrica'],
      ['Herm�tica', 'Hermética'],
      ['Expans�o', 'Expansão'],
      ['Termost�tica', 'Termostática'],
      ['P� Redondo', 'Pé Redondo'],
      ['Balc�o', 'Balcão'],
      ['balc�o', 'balcão'],
      ['Bra�o', 'Braço'],
      ['bra�o', 'braço'],
      ['N�vel', 'Nível'],
      ['n�vel', 'nível'],
      ['Vit�ria', 'Vitória'],
      ['Pr�tico', 'Prático'],
      ['T�cnico', 'Técnico'],
      ['S�rie', 'Série'],
      ['F�brica', 'Fábrica'],
      ['M�quina', 'Máquina'],
      ['El�trodo', 'Eletrodo'],
      ['Sold�vel', 'Soldável'],
      ['Refrigera��o', 'Refrigeração'],
      ['refrigera��o', 'refrigeração'],
      ['Veda��o', 'Vedação'],
      ['Isola��o', 'Isolação'],
      ['Instala��o', 'Instalação'],
      ['Manuten��o', 'Manutenção'],
      ['Produ��o', 'Produção'],
    ]

    function reparar(texto) {
      if (!texto) return texto
      var s = String(texto)
      if (s.indexOf('\uFFFD') === -1) return s
      for (var i = 0; i < REPAROS.length; i++) {
        s = s.split(REPAROS[i][0]).join(REPAROS[i][1])
      }
      return s
    }

    function temPendencia(s) {
      return s && String(s).indexOf('\uFFFD') !== -1
    }

    function repararRegistro(rec, campos) {
      var mudou = false
      for (var c = 0; c < campos.length; c++) {
        var campo = campos[c]
        var atual = rec.getString(campo) || ''
        if (!temPendencia(atual)) continue
        var novo = reparar(atual)
        if (novo !== atual) {
          rec.set(campo, novo)
          mudou = true
        }
      }
      return mudou
    }

    // --- componentes -------------------------------------------------------
    var reparadosComp = 0
    var comps = app.findRecordsByFilter('componentes', '', 'created', 100000, 0)
    for (var i = 0; i < comps.length; i++) {
      if (repararRegistro(comps[i], ['descricao', 'categoria', 'fornecedor', 'unidade'])) {
        app.save(comps[i])
        reparadosComp++
      }
    }

    // --- boms (o save dispara os hooks de NCM com o texto já corrigido) ----
    var reparadosBoms = 0
    var boms = app.findRecordsByFilter('boms', '', 'created', 100000, 0)
    for (var b = 0; b < boms.length; b++) {
      if (repararRegistro(boms[b], ['nome', 'descricao', 'categoria'])) {
        app.save(boms[b])
        reparadosBoms++
      }
    }

    // --- bom_items ---------------------------------------------------------
    var reparadosItens = 0
    var itens = app.findRecordsByFilter('bom_items', '', 'created', 100000, 0)
    for (var it = 0; it < itens.length; it++) {
      if (repararRegistro(itens[it], ['descricao', 'categoria', 'fornecedor', 'codigo'])) {
        app.save(itens[it])
        reparadosItens++
      }
    }

    console.log(
      '[Mojibake 0031] componentes: ' +
        reparadosComp +
        ' reparado(s) | boms: ' +
        reparadosBoms +
        ' | bom_items: ' +
        reparadosItens,
    )
  },
  (app) => {
    // rollback: no-op (reparo de texto não tem desfaço genérico)
  },
)
