/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0037: reparo definitivo de mojibake em textos de TODAS as
 * coleções com texto de usuário — componentes, boms, bom_items, propostas,
 * proposta_items, clientes, faturamentos, ordens_compra, ordem_compra_itens,
 * contas_pagar, contas_receber, comissoes, contratos, categorias_produto,
 * modelos_contrato, parametros e empresa.
 *
 * Duas correções, idempotentes:
 * 1. Dupla codificação Latin-1→UTF-8 ("Ã©"→"é", "BraÃ§o"→"Braço"): reconstrói
 *    o codepoint UTF-8 original a partir dos bytes "visíveis" como Latin-1.
 *    Só grava quando de fato muda — texto saudável é preservado intacto.
 * 2. U+FFFD restante ("El\uFFFDtrica"): aplica a mesma tabela de substituições
 *    conhecidas da 0031 e, no que sobrar (irrecuperável), remove o caractere
 *    para não poluir a exibição.
 *
 * No-op em banco vazio ou já corrigido. NUNCA toca em fórmula de precificação,
 * hierarquia de BOMs ou regras fiscais — só campos de texto.
 */
migrate(
  (app) => {
    // Pares [contendo "\uFFFD", correto]. Padrões mais longos primeiro.
    var REPAROS = [
      ['��o', 'ção'],
      ['��es', 'ções'],
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
      ['Caf�', 'Café'],
      ['caf�', 'café'],
      ['Op��o', 'Opção'],
      ['A��o', 'Ação'],
      ['N�', 'Não'],
      ['n�o', 'não'],
      ['S�', 'Sim'],
      ['J�', 'Já'],
      ['At�', 'Até'],
      ['ap�s', 'após'],
      ['est�', 'está'],
      ['Est�', 'Está'],
      ['Ent�o', 'Então'],
      ['ent�o', 'então'],
      ['In�cio', 'Início'],
      ['in�cio', 'início'],
      ['P�blico', 'Público'],
      ['p�blico', 'público'],
      ['�rg�o', 'órgão'],
      ['�ndice', 'Índice'],
      ['�timo', 'ótimo'],
      ['Servi�o', 'Serviço'],
      ['servi�o', 'serviço'],
      ['Pre�o', 'Preço'],
      ['pre�o', 'preço'],
      ['Pe�a', 'Peça'],
      ['pe�a', 'peça'],
      ['Ra�z', 'Raiz'],
      ['Tecido', 'Tecido'],
    ]

    /** Reconstrói codepoints UTF-8 lidos como Latin-1 (Ã©→é, BraÃ§o→Braço). */
    function repararDuplaCodificacao(texto) {
      if (!texto) return texto
      var s = String(texto)
      // Heurística: só tenta se houver um padrão típico de dupla codificação
      // ("Ã" seguido de byte de continuação, ou "Â" idem) — evita mexer em
      // texto que tem esses chars por serem legítimos em palavras raras.
      if (s.indexOf('Ã') === -1 && s.indexOf('Â') === -1 && s.indexOf('�') === -1) return s
      var out = ''
      var i = 0
      while (i < s.length) {
        var c = s.charCodeAt(i)
        var n = i + 1 < s.length ? s.charCodeAt(i + 1) : -1
        var n2 = i + 2 < s.length ? s.charCodeAt(i + 2) : -1
        if (c >= 0xc2 && c <= 0xdf && n >= 0x80 && n <= 0xbf) {
          var cp = ((c & 0x1f) << 6) | (n & 0x3f)
          out += String.fromCharCode(cp)
          i += 2
        } else if (c >= 0xe0 && c <= 0xef && n >= 0x80 && n <= 0xbf && n2 >= 0x80 && n2 <= 0xbf) {
          var cp3 = ((c & 0x0f) << 12) | ((n & 0x3f) << 6) | (n2 & 0x3f)
          out += String.fromCharCode(cp3)
          i += 3
        } else {
          out += s.charAt(i)
          i += 1
        }
      }
      return out
    }

    function repararTexto(texto) {
      if (!texto) return texto
      var s = String(texto)
      var comUfffd = s.indexOf('\uFFFD') !== -1
      var novo = repararDuplaCodificacao(s)
      if (comUfffd || novo.indexOf('\uFFFD') !== -1) {
        for (var i = 0; i < REPAROS.length; i++) {
          novo = novo.split(REPAROS[i][0]).join(REPAROS[i][1])
        }
        // Irrecuperável: remove o caractere quebrado restante
        novo = novo.split('\uFFFD').join('')
      }
      return novo
    }

    function repararRegistro(rec, campos) {
      var mudou = false
      for (var c = 0; c < campos.length; c++) {
        var campo = campos[c]
        var atual = rec.getString(campo) || ''
        var novo = repararTexto(atual)
        if (novo !== atual) {
          rec.set(campo, novo)
          mudou = true
        }
      }
      return mudou
    }

    var COLECOES = [
      ['componentes', ['descricao', 'categoria', 'fornecedor', 'unidade', 'codigo']],
      ['boms', ['nome', 'descricao', 'categoria', 'sku']],
      ['bom_items', ['descricao', 'categoria', 'fornecedor', 'codigo']],
      ['propostas', ['cliente', 'observacoes', 'motivo_perda']],
      ['proposta_items', ['nome_produto', 'sku']],
      ['clientes', ['razao_social', 'cidade', 'endereco', 'contato']],
      [
        'faturamentos',
        [
          'cliente_razao_social',
          'cliente_cidade',
          'cliente_endereco',
          'cliente_contato',
          'observacoes',
        ],
      ],
      ['ordens_compra', ['fornecedor', 'observacoes']],
      ['ordem_compra_itens', ['descricao', 'categoria', 'fornecedor', 'codigo']],
      ['contas_pagar', ['descricao', 'fornecedor', 'categoria', 'observacoes']],
      ['contas_receber', ['cliente_nome', 'observacoes']],
      ['comissoes', ['cliente_nome', 'observacoes']],
      ['contratos', ['observacoes']],
      ['categorias_produto', ['nome', 'descricao']],
      ['modelos_contrato', ['nome', 'conteudo']],
      ['parametros', ['valor_texto']],
      ['empresa', ['razao_social', 'endereco', 'cidade']],
    ]

    var resumo = []
    for (var k = 0; k < COLECOES.length; k++) {
      var nome = COLECOES[k][0]
      var campos = COLECOES[k][1]
      var reparados = 0
      try {
        var registros = app.findRecordsByFilter(nome, '', 'created', 100000, 0)
        for (var r = 0; r < registros.length; r++) {
          if (repararRegistro(registros[r], campos)) {
            app.save(registros[r])
            reparados++
          }
        }
      } catch (err) {
        // Coleção pode não existir neste projeto — ignora e segue
        console.log('[Mojibake 0037] coleção ' + nome + ' pulada: ' + err)
        continue
      }
      resumo.push(nome + ': ' + reparados)
    }
    console.log('[Mojibake 0037] reparados — ' + resumo.join(' | '))
  },
  (app) => {
    // rollback: no-op (reparo de texto não tem desfaço genérico)
  },
)
