migrate(
  (app) => {
    // 1. Seed Usuário Admin
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'marins.felipe@yahoo.com.br')
    } catch (_) {
      const record = new Record(users)
      record.setEmail('marins.felipe@yahoo.com.br')
      record.setPassword('Skip@Pass')
      record.setVerified(true)
      record.set('name', 'Felipe Marins (Admin)')
      app.save(record)
    }

    // 2. Seed Parâmetros Financeiros Iniciais
    const paramsCol = app.findCollectionByNameOrId('parametros')
    const defaultParams = [
      {
        chave: 'overhead',
        nome: 'Overhead / Custos Indiretos',
        valor_percentual: 14.5,
        descricao: 'Energia, fábrica, depreciação e despesas administrativas',
        ordem: 1,
      },
      {
        chave: 'margem_alvo',
        nome: 'Margem de Lucro Alvo',
        valor_percentual: 28.0,
        descricao: 'Margem bruta desejada sobre as vendas de refrigeração',
        ordem: 2,
      },
      {
        chave: 'impostos',
        nome: 'Impostos s/ Venda Estimados',
        valor_percentual: 12.0,
        descricao: 'ICMS, PIS/COFINS e encargos incidentes',
        ordem: 3,
      },
      {
        chave: 'comissao',
        nome: 'Comissão de Vendas',
        valor_percentual: 3.5,
        descricao: 'Comissão média paga a representantes e equipe comercial',
        ordem: 4,
      },
    ]

    for (const p of defaultParams) {
      try {
        app.findFirstRecordByData('parametros', 'chave', p.chave)
      } catch (_) {
        const rec = new Record(paramsCol)
        rec.set('chave', p.chave)
        rec.set('nome', p.nome)
        rec.set('valor_percentual', p.valor_percentual)
        rec.set('descricao', p.descricao)
        rec.set('ordem', p.ordem)
        app.save(rec)
      }
    }

    // 3. Seed Componentes Refrigeração Comercial
    const compCol = app.findCollectionByNameOrId('componentes')
    const rawComponentes = [
      {
        codigo: 'CMP-0101',
        descricao: 'Compressor Hermético Embraco 1/2HP R290 220V',
        categoria: 'Refrigeração',
        unidade: 'UN',
        custo_unitario: 685.5,
        fornecedor: 'Embraco Brasil',
      },
      {
        codigo: 'CMP-0102',
        descricao: 'Compressor Hermético Tecumseh 3/4HP R404A 220V',
        categoria: 'Refrigeração',
        unidade: 'UN',
        custo_unitario: 940.0,
        fornecedor: 'Tecumseh do Brasil',
      },
      {
        codigo: 'EVAP-0201',
        descricao: 'Evaporador Aletado Cobre/Alumínio 4 Tubos 1200mm',
        categoria: 'Evaporação',
        unidade: 'UN',
        custo_unitario: 340.2,
        fornecedor: 'Frigoking Componentes',
      },
      {
        codigo: 'EVAP-0202',
        descricao: 'Evaporador Forçador de Ar Compacto Duplo Micromotor',
        categoria: 'Evaporação',
        unidade: 'UN',
        custo_unitario: 480.0,
        fornecedor: 'Frigoking Componentes',
      },
      {
        codigo: 'COND-0301',
        descricao: 'Condensador Estático Aço Helicoidal 1/2HP',
        categoria: 'Condensação',
        unidade: 'UN',
        custo_unitario: 215.8,
        fornecedor: 'Delta Serpentinas',
      },
      {
        codigo: 'COND-0302',
        descricao: 'Unidade Condensadora Ventilada Completa 3/4HP',
        categoria: 'Condensação',
        unidade: 'UN',
        custo_unitario: 890.0,
        fornecedor: 'Delta Serpentinas',
      },
      {
        codigo: 'CTRL-0401',
        descricao: 'Controlador Digital de Temperatura Full Gauge TC-900E',
        categoria: 'Elétrica & Controle',
        unidade: 'UN',
        custo_unitario: 165.4,
        fornecedor: 'Full Gauge Controls',
      },
      {
        codigo: 'CTRL-0402',
        descricao: 'Termostato Analógico de Segurança Robertshaw',
        categoria: 'Elétrica & Controle',
        unidade: 'UN',
        custo_unitario: 45.0,
        fornecedor: 'Robertshaw Brasil',
      },
      {
        codigo: 'CH-0501',
        descricao: 'Chapa Aço Inox AISI 430 Escovado 0.8mm (m²)',
        categoria: 'Estrutura & Funilaria',
        unidade: 'M2',
        custo_unitario: 98.7,
        fornecedor: 'Aperam South America',
      },
      {
        codigo: 'CH-0502',
        descricao: 'Chapa Aço Pré-pintado Branco Epóxi 0.6mm (m²)',
        categoria: 'Estrutura & Funilaria',
        unidade: 'M2',
        custo_unitario: 52.3,
        fornecedor: 'CSN Distribuição',
      },
      {
        codigo: 'ISO-0601',
        descricao: 'Espuma Poliuretano Rígido Injetado Alta Densidade (kg)',
        categoria: 'Isolamento Térmico',
        unidade: 'KG',
        custo_unitario: 24.5,
        fornecedor: 'Dow Brasil Química',
      },
      {
        codigo: 'VID-0701',
        descricao: 'Vidro Curvo Temperado Duplo Low-e 6mm com Aquecimento',
        categoria: 'Vidros & Acabamento',
        unidade: 'UN',
        custo_unitario: 520.0,
        fornecedor: 'Tempervidros Indústria',
      },
      {
        codigo: 'VID-0702',
        descricao: 'Porta de Vidro Duplo com Moldura em PVC e Resistência',
        categoria: 'Vidros & Acabamento',
        unidade: 'UN',
        custo_unitario: 410.0,
        fornecedor: 'Vidroforte Soluções',
      },
      {
        codigo: 'ILU-0801',
        descricao: 'Barra LED Linear 120cm Branco Quente 3000K 12V IP65',
        categoria: 'Iluminação',
        unidade: 'UN',
        custo_unitario: 38.9,
        fornecedor: 'Llum Iluminação Tech',
      },
      {
        codigo: 'ILU-0802',
        descricao: 'Fonte Chaveada 12V 5A Bivolt Slim',
        categoria: 'Iluminação',
        unidade: 'UN',
        custo_unitario: 42.0,
        fornecedor: 'Llum Iluminação Tech',
      },
      {
        codigo: 'GAX-0901',
        descricao: 'Gaxeta Magnética de Vedação Cinza Perfil Standard (metro)',
        categoria: 'Vedação & Acessórios',
        unidade: 'M',
        custo_unitario: 14.8,
        fornecedor: 'Vedaflex Perfis',
      },
      {
        codigo: 'GRA-1001',
        descricao: 'Prateleira Aramada Reforçada Epóxi 1150x400mm',
        categoria: 'Acessórios Internos',
        unidade: 'UN',
        custo_unitario: 65.0,
        fornecedor: 'Metalúrgica Mor',
      },
      {
        codigo: 'GAS-1101',
        descricao: 'Gás Refrigerante Ecológico R290 Lata 370g',
        categoria: 'Fluidos',
        unidade: 'UN',
        custo_unitario: 32.5,
        fornecedor: 'Chemours Brasil',
      },
    ]

    const compMap = {}
    for (const c of rawComponentes) {
      try {
        const existing = app.findFirstRecordByData('componentes', 'codigo', c.codigo)
        compMap[c.codigo] = existing
      } catch (_) {
        const rec = new Record(compCol)
        rec.set('codigo', c.codigo)
        rec.set('descricao', c.descricao)
        rec.set('categoria', c.categoria)
        rec.set('unidade', c.unidade)
        rec.set('custo_unitario', c.custo_unitario)
        rec.set('fornecedor', c.fornecedor)
        app.save(rec)
        compMap[c.codigo] = rec
      }
    }

    // 4. Seed 3 BOMs Piloto descritos na especificação:
    // Balcão Strongest, Vitrine Aprezzo, Expositor Fredda
    const bomsCol = app.findCollectionByNameOrId('boms')
    const bomItemsCol = app.findCollectionByNameOrId('bom_items')

    const pilotBoms = [
      {
        sku: 'BAL-STR-200',
        nome: 'Balcão Refrigerado Strongest 2.0m',
        descricao:
          'Balcão refrigerado de alto rendimento para açougues e padarias com tampo em inox',
        categoria: 'Balcões Refrigerados',
        overhead_percentual: 14.5,
        margem_percentual: 28.0,
        itens: [
          {
            nivel: 1,
            ordem: 1,
            tipo_linha: 'submontagem',
            codigo: 'SUB-SIS-01',
            descricao: 'Conjunto Sistema Frigorífico R290',
            categoria: 'Refrigeração',
            unidade: 'UN',
            quantidade: 1,
            custo_unitario: 0,
            fornecedor: 'Engenharia Interna',
          },
          { nivel: 2, ordem: 2, compCode: 'CMP-0101', quantidade: 1 },
          { nivel: 2, ordem: 3, compCode: 'EVAP-0201', quantidade: 1 },
          { nivel: 2, ordem: 4, compCode: 'COND-0301', quantidade: 1 },
          { nivel: 2, ordem: 5, compCode: 'GAS-1101', quantidade: 2 },
          {
            nivel: 1,
            ordem: 6,
            tipo_linha: 'submontagem',
            codigo: 'SUB-GAB-01',
            descricao: 'Gabinete Isolado e Funilaria Inox',
            categoria: 'Estrutura & Funilaria',
            unidade: 'UN',
            quantidade: 1,
            custo_unitario: 0,
            fornecedor: 'Estamparia Interna',
          },
          { nivel: 2, ordem: 7, compCode: 'CH-0501', quantidade: 8 },
          { nivel: 2, ordem: 8, compCode: 'ISO-0601', quantidade: 25 },
          { nivel: 2, ordem: 9, compCode: 'GAX-0901', quantidade: 6 },
          {
            nivel: 1,
            ordem: 10,
            tipo_linha: 'submontagem',
            codigo: 'SUB-ELE-01',
            descricao: 'Painel Elétrico, Comando e Iluminação',
            categoria: 'Elétrica & Controle',
            unidade: 'UN',
            quantidade: 1,
            custo_unitario: 0,
            fornecedor: 'Montagem Elétrica',
          },
          { nivel: 2, ordem: 11, compCode: 'CTRL-0401', quantidade: 1 },
          { nivel: 2, ordem: 12, compCode: 'ILU-0801', quantidade: 2 },
          { nivel: 2, ordem: 13, compCode: 'ILU-0802', quantidade: 1 },
          { nivel: 1, ordem: 14, compCode: 'GRA-1001', quantidade: 4 },
        ],
      },
      {
        sku: 'VIT-APR-150',
        nome: 'Vitrine Aprezzo Curva 1.5m',
        descricao:
          'Vitrine expositora premium com vidro curvo aquecido para confeitarias e delicatessens',
        categoria: 'Vitrines Panorâmicas',
        overhead_percentual: 14.5,
        margem_percentual: 30.0,
        itens: [
          { nivel: 1, ordem: 1, compCode: 'VID-0701', quantidade: 1 },
          {
            nivel: 1,
            ordem: 2,
            tipo_linha: 'submontagem',
            codigo: 'SUB-REV-02',
            descricao: 'Refrigeração Silenciosa Suave',
            categoria: 'Refrigeração',
            unidade: 'UN',
            quantidade: 1,
            custo_unitario: 0,
            fornecedor: 'Engenharia Interna',
          },
          { nivel: 2, ordem: 3, compCode: 'CMP-0101', quantidade: 1 },
          { nivel: 2, ordem: 4, compCode: 'EVAP-0202', quantidade: 1 },
          { nivel: 2, ordem: 5, compCode: 'COND-0301', quantidade: 1 },
          { nivel: 2, ordem: 6, compCode: 'GAS-1101', quantidade: 1 },
          { nivel: 1, ordem: 7, compCode: 'CH-0501', quantidade: 5 },
          { nivel: 1, ordem: 8, compCode: 'ISO-0601', quantidade: 18 },
          { nivel: 1, ordem: 9, compCode: 'CTRL-0401', quantidade: 1 },
          { nivel: 1, ordem: 10, compCode: 'ILU-0801', quantidade: 3 },
          { nivel: 1, ordem: 11, compCode: 'ILU-0802', quantidade: 1 },
          { nivel: 1, ordem: 12, compCode: 'GRA-1001', quantidade: 3 },
        ],
      },
      {
        sku: 'EXP-FRE-210',
        nome: 'Expositor Vertical Fredda 3 Portas',
        descricao:
          'Auto-serviço vertical para bebidas e laticínios com portas de vidro antiembaçante',
        categoria: 'Expositores Verticais',
        overhead_percentual: 15.0,
        margem_percentual: 26.0,
        itens: [
          {
            nivel: 1,
            ordem: 1,
            tipo_linha: 'submontagem',
            codigo: 'SUB-FRG-03',
            descricao: 'Unidade de Força Forçada 3/4HP',
            categoria: 'Refrigeração',
            unidade: 'UN',
            quantidade: 1,
            custo_unitario: 0,
            fornecedor: 'Engenharia Interna',
          },
          { nivel: 2, ordem: 2, compCode: 'CMP-0102', quantidade: 1 },
          { nivel: 2, ordem: 3, compCode: 'COND-0302', quantidade: 1 },
          { nivel: 2, ordem: 4, compCode: 'EVAP-0202', quantidade: 1 },
          { nivel: 2, ordem: 5, compCode: 'GAS-1101', quantidade: 3 },
          { nivel: 1, ordem: 6, compCode: 'VID-0702', quantidade: 3 },
          { nivel: 1, ordem: 7, compCode: 'CH-0502', quantidade: 14 },
          { nivel: 1, ordem: 8, compCode: 'ISO-0601', quantidade: 42 },
          { nivel: 1, ordem: 9, compCode: 'GAX-0901', quantidade: 12 },
          { nivel: 1, ordem: 10, compCode: 'CTRL-0401', quantidade: 1 },
          { nivel: 1, ordem: 11, compCode: 'CTRL-0402', quantidade: 1 },
          { nivel: 1, ordem: 12, compCode: 'ILU-0801', quantidade: 4 },
          { nivel: 1, ordem: 13, compCode: 'ILU-0802', quantidade: 2 },
          { nivel: 1, ordem: 14, compCode: 'GRA-1001', quantidade: 12 },
        ],
      },
    ]

    for (const b of pilotBoms) {
      let bomRecord
      try {
        bomRecord = app.findFirstRecordByData('boms', 'sku', b.sku)
      } catch (_) {
        bomRecord = new Record(bomsCol)
        bomRecord.set('sku', b.sku)
        bomRecord.set('nome', b.nome)
        bomRecord.set('descricao', b.descricao)
        bomRecord.set('categoria', b.categoria)
        bomRecord.set('overhead_percentual', b.overhead_percentual)
        bomRecord.set('margem_percentual', b.margem_percentual)
        app.save(bomRecord)
      }

      // Remover itens pré-existentes se houver, para manter limpo e idempotente
      const existingItems = app.findRecordsByFilter(
        'bom_items',
        `bom_id = '${bomRecord.id}'`,
        'ordem',
        200,
        0,
      )
      if (existingItems.length === 0) {
        for (const it of b.itens) {
          const itemRec = new Record(bomItemsCol)
          itemRec.set('bom_id', bomRecord.id)
          itemRec.set('nivel', it.nivel)
          itemRec.set('ordem', it.ordem)
          itemRec.set('quantidade', it.quantidade)

          if (it.compCode && compMap[it.compCode]) {
            const comp = compMap[it.compCode]
            itemRec.set('componente_id', comp.id)
            itemRec.set('codigo', comp.getString('codigo'))
            itemRec.set('descricao', comp.getString('descricao'))
            itemRec.set('categoria', comp.getString('categoria'))
            itemRec.set('unidade', comp.getString('unidade'))
            itemRec.set('custo_unitario', comp.getFloat('custo_unitario'))
            itemRec.set('fornecedor', comp.getString('fornecedor'))
            itemRec.set('tipo_linha', 'componente')
          } else {
            itemRec.set('codigo', it.codigo)
            itemRec.set('descricao', it.descricao)
            itemRec.set('categoria', it.categoria || 'Geral')
            itemRec.set('unidade', it.unidade || 'UN')
            itemRec.set('custo_unitario', it.custo_unitario || 0)
            itemRec.set('fornecedor', it.fornecedor || 'Produção Interna')
            itemRec.set('tipo_linha', it.tipo_linha || 'submontagem')
          }
          app.save(itemRec)
        }
      }
    }
  },
  (app) => {
    // down: rollback seed
  },
)
