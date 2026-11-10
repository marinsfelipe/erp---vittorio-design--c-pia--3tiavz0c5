migrate(
  (app) => {
    // 1. Coleção categorias_produto: lista oficial de categorias de produtos
    // Permite que qualquer usuário autenticado liste e crie categorias.
    let categorias
    try {
      categorias = app.findCollectionByNameOrId('categorias_produto')
    } catch (_) {
      categorias = new Collection({
        name: 'categorias_produto',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'nome', type: 'text', required: true, max: 120 },
          { name: 'descricao', type: 'text', required: false, max: 255 },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_categorias_produto_nome ON categorias_produto (nome)',
        ],
      })
      app.save(categorias)
    }

    // 2. Seed / Backfill inicial com categorias existentes em boms e padrões do sistema
    const categoriasIniciais = [
      'Balcões Refrigerados',
      'Vitrines Panorâmicas',
      'Expositores Verticais',
      'Ilhas de Congelados',
      'Câmaras Frigoríficas',
      'Auto-serviço',
    ]

    // Também coletar categorias já usadas nos registros existentes de boms
    try {
      const bomsExistentes = app.findRecordsByFilter('boms', '', 'created', 1000, 0)
      for (const b of bomsExistentes) {
        const cat = (b.getString('categoria') || '').trim()
        if (cat && !categoriasIniciais.includes(cat)) {
          categoriasIniciais.push(cat)
        }
      }
    } catch (_) {}

    const colCategorias = app.findCollectionByNameOrId('categorias_produto')
    for (const nomeCat of categoriasIniciais) {
      const nomeTrim = nomeCat.trim()
      if (!nomeTrim) continue
      let existe = null
      try {
        existe = app.findFirstRecordByData('categorias_produto', 'nome', nomeTrim)
      } catch (_) {
        existe = null
      }
      if (!existe) {
        const rec = new Record(colCategorias)
        rec.set('nome', nomeTrim)
        rec.set('ativo', true)
        app.save(rec)
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('categorias_produto')
      app.delete(col)
    } catch (_) {}
  },
)
