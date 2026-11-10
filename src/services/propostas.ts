import pb from '@/lib/pocketbase/client'
import { calcularMarkupDivisor, montarPercentuais } from '@/utils/pricing'
import type {
  Proposta,
  PropostaItem,
  PropostaStatus,
  Bom,
  BomItem,
  Parametro,
  DescontoTipo,
} from '@/types/erp'
import { calcularDescontoItem, calcularTotaisProposta } from '@/utils/descontos'
import { auditoriaDescontosService } from '@/services/auditoriaDescontos'
import { parametrosService } from '@/services/parametros'

/** Snapshot estático dos dados do BOM usados na proposta (imune a mudanças futuras). */
export interface PropostaItemInput {
  bom_id?: string
  sku: string
  nome_produto: string
  quantidade: number
  preco_unitario: number
  custo_unitario: number
  preco_direto?: boolean
  unidade?: string
}

/** Custo consolidado (soma qtd × custo unitário) dos componentes do BOM. */
export function calcularCustoConsolidado(items: BomItem[]): number {
  return items.reduce(
    (acc, it) => acc + (Number(it.quantidade) || 0) * (Number(it.custo_unitario) || 0),
    0,
  )
}

/** Monta o snapshot de itens da proposta a partir dos BOMs e parâmetros atuais. */
export async function montarItensProposta(
  selecoes: Array<{ bom: Bom; quantidade: number }>,
): Promise<PropostaItemInput[]> {
  const parametros = await pb.collection('parametros').getFullList<Parametro>({
    sort: 'ordem,nome',
  })
  const pMap: Record<string, number> = {}
  parametros.forEach((p) => {
    pMap[p.chave] = p.valor_percentual
  })
  const itens: PropostaItemInput[] = []
  for (const { bom, quantidade } of selecoes) {
    if (quantidade <= 0) continue
    const bomItems = await pb
      .collection('bom_items')
      .getFullList<BomItem>({ filter: `bom_id = '${bom.id.replace(/'/g, "\\'")}'` })
    const custo = calcularCustoConsolidado(bomItems)
    // Mesma fórmula da precificação: markup divisor com TODOS os percentuais
    // da tabela de parâmetros (com override de overhead/margem do SKU).
    const percentuais = montarPercentuais(pMap, {
      overhead: bom.overhead_percentual,
      margem: bom.margem_percentual,
    })
    const resultado = calcularMarkupDivisor(custo, percentuais)
    if (!resultado.valido) {
      throw new Error(resultado.erro ?? 'Parâmetro de precificação inválido.')
    }
    const precoCalculado = resultado.precoVenda

    // Prioridade do preço unitário: preço final da tabela > preço calculado markup
    const precoUnitarioPadrao =
      bom.preco_final_tabela !== undefined &&
      bom.preco_final_tabela !== null &&
      Number(bom.preco_final_tabela) > 0
        ? Number(bom.preco_final_tabela)
        : precoCalculado

    itens.push({
      bom_id: bom.id,
      sku: bom.sku,
      nome_produto: bom.nome,
      quantidade,
      preco_unitario: precoUnitarioPadrao,
      custo_unitario: custo,
      unidade: bom.unidade || 'UN',
    })
  }
  return itens
}

export const propostasService = {
  async getAll(): Promise<Proposta[]> {
    return await pb.collection('propostas').getFullList<Proposta>({
      sort: '-created',
      expand: 'criador',
    })
  },

  async getById(id: string): Promise<Proposta> {
    return await pb.collection('propostas').getOne<Proposta>(id, {
      expand: 'criador',
    })
  },

  async getItems(propostaId: string): Promise<PropostaItem[]> {
    return await pb.collection('proposta_items').getFullList<PropostaItem>({
      filter: `proposta_id = '${propostaId.replace(/'/g, "\\'")}'`,
      sort: 'created,sku',
    })
  },

  async create(
    cliente: string,
    observacoes: string,
    itens: PropostaItemInput[],
    criadorId?: string,
  ): Promise<Proposta> {
    const valorTotal = itens.reduce((acc, i) => acc + i.preco_unitario * i.quantidade, 0)
    const criador = criadorId || pb.authStore.record?.id || ''
    const payload: Record<string, any> = {
      cliente,
      status: 'rascunho',
      valor_total: valorTotal,
      observacoes,
    }
    if (criador) {
      payload.criador = criador
    }
    const proposta = await pb.collection('propostas').create<Proposta>(payload)
    for (const it of itens) {
      await pb.collection('proposta_items').create<PropostaItem>({
        proposta_id: proposta.id,
        bom_id: it.bom_id || '',
        sku: it.sku,
        nome_produto: it.nome_produto,
        quantidade: it.quantidade,
        preco_unitario: it.preco_unitario,
        custo_unitario: it.custo_unitario,
        preco_direto: it.preco_direto ?? false,
        unidade: it.unidade || 'UN',
      })
    }
    return proposta
  },

  async addItem(propostaId: string, item: PropostaItemInput): Promise<PropostaItem> {
    const createdItem = await pb.collection('proposta_items').create<PropostaItem>({
      proposta_id: propostaId,
      bom_id: item.bom_id || '',
      sku: item.sku,
      nome_produto: item.nome_produto,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      custo_unitario: item.custo_unitario,
      preco_direto: item.preco_direto ?? false,
      unidade: item.unidade || 'UN',
      preco_liquido: item.preco_unitario,
      total_desconto: 0,
    })

    // Recalcular totais consolidados da proposta
    await this.recalcularTotaisProposta(propostaId)

    return createdItem
  },

  async recalcularTotaisProposta(propostaId: string): Promise<Proposta> {
    const proposta = await this.getById(propostaId)
    const itens = await this.getItems(propostaId)
    const totais = calcularTotaisProposta(itens, proposta.desconto_tipo, proposta.desconto_valor)

    return await pb.collection('propostas').update<Proposta>(propostaId, {
      subtotal: totais.subtotal,
      total_desconto_itens: totais.totalDescontoItens,
      total_desconto_geral: totais.totalDescontoGeral,
      valor_total: totais.totalFinal,
    })
  },

  /**
   * Aplica ou remove desconto em um item individual da proposta
   */
  async aplicarDescontoItem(params: {
    propostaId: string
    itemId: string
    descontoTipo: DescontoTipo
    descontoValor: number
    isVendedor?: boolean
    userPerfil?: string
  }): Promise<{ proposta: Proposta; item: PropostaItem; aguardandoAprovacao: boolean }> {
    const { propostaId, itemId, descontoTipo, descontoValor, isVendedor } = params
    const itemAtual = await pb.collection('proposta_items').getOne<PropostaItem>(itemId)
    const propostaAtual = await this.getById(propostaId)
    const itensAtuais = await this.getItems(propostaId)

    const calc = calcularDescontoItem({
      precoUnitario: itemAtual.preco_unitario,
      quantidade: itemAtual.quantidade,
      descontoTipo,
      descontoValor,
    })

    const authUser = pb.authStore.record
    const agoraIso = new Date().toISOString()

    // 1. Atualizar o item
    const itemAtualizado = await pb.collection('proposta_items').update<PropostaItem>(itemId, {
      desconto_tipo: descontoTipo,
      desconto_valor: Math.max(0, Number(descontoValor) || 0),
      preco_liquido: calc.precoLiquido,
      total_desconto: calc.totalDescontoItem,
      desconto_aplicado_por: authUser?.id || '',
      desconto_aplicado_em: agoraIso,
    })

    // 2. Registrar auditoria
    await auditoriaDescontosService.registrar({
      proposta: propostaId,
      item: itemId,
      tipo_alvo: 'item',
      item_sku: itemAtual.sku,
      item_nome: itemAtual.nome_produto,
      desconto_tipo: descontoTipo,
      desconto_valor_informado: Number(descontoValor) || 0,
      desconto_valor_total: calc.totalDescontoItem,
      valor_base_anterior: itemAtual.preco_unitario * itemAtual.quantidade,
      valor_final_resultante: calc.precoLiquido * itemAtual.quantidade,
      usuario: authUser?.id || '',
      usuario_nome: authUser?.name || authUser?.email || 'Usuário',
      usuario_email: authUser?.email || '',
      observacao:
        descontoValor > 0
          ? `Desconto por item: ${descontoTipo === 'percentual' ? `${descontoValor}%` : `R$ ${descontoValor}`}`
          : 'Desconto removido do item',
    })

    // 3. Recalcular proposta e verificar limite para vendedores
    const itensAtualizados = itensAtuais.map((it) => (it.id === itemId ? itemAtualizado : it))
    const totais = calcularTotaisProposta(
      itensAtualizados,
      propostaAtual.desconto_tipo,
      propostaAtual.desconto_valor,
    )

    let novoStatus = propostaAtual.status
    let statusAnterior = propostaAtual.status_anterior_aprovacao
    let aguardandoAprovacao = false

    if (isVendedor) {
      const limite = await parametrosService.getLimiteDescontoVendedor()
      if (
        totais.percentualDescontoTotal > limite &&
        propostaAtual.status !== 'aguardando_aprovacao'
      ) {
        statusAnterior = propostaAtual.status
        novoStatus = 'aguardando_aprovacao'
        aguardandoAprovacao = true
      }
    }

    const propostaAtualizada = await pb.collection('propostas').update<Proposta>(propostaId, {
      subtotal: totais.subtotal,
      total_desconto_itens: totais.totalDescontoItens,
      total_desconto_geral: totais.totalDescontoGeral,
      valor_total: totais.totalFinal,
      status: novoStatus,
      ...(statusAnterior ? { status_anterior_aprovacao: statusAnterior } : {}),
    })

    return {
      proposta: propostaAtualizada,
      item: itemAtualizado,
      aguardandoAprovacao,
    }
  },

  /**
   * Aplica ou remove desconto geral sobre a proposta
   */
  async aplicarDescontoGeral(params: {
    propostaId: string
    descontoTipo: DescontoTipo
    descontoValor: number
    isVendedor?: boolean
    userPerfil?: string
  }): Promise<{ proposta: Proposta; aguardandoAprovacao: boolean }> {
    const { propostaId, descontoTipo, descontoValor, isVendedor } = params
    const propostaAtual = await this.getById(propostaId)
    const itens = await this.getItems(propostaId)

    const valorInformado = Math.max(0, Number(descontoValor) || 0)
    const totais = calcularTotaisProposta(itens, descontoTipo, valorInformado)

    const authUser = pb.authStore.record
    const agoraIso = new Date().toISOString()

    // 1. Auditoria
    await auditoriaDescontosService.registrar({
      proposta: propostaId,
      tipo_alvo: 'geral',
      desconto_tipo: descontoTipo,
      desconto_valor_informado: valorInformado,
      desconto_valor_total: totais.totalDescontoGeral,
      valor_base_anterior: totais.subtotalAposDescontoItens,
      valor_final_resultante: totais.totalFinal,
      usuario: authUser?.id || '',
      usuario_nome: authUser?.name || authUser?.email || 'Usuário',
      usuario_email: authUser?.email || '',
      observacao:
        valorInformado > 0
          ? `Desconto geral: ${descontoTipo === 'percentual' ? `${valorInformado}%` : `R$ ${valorInformado}`}`
          : 'Desconto geral removido',
    })

    let novoStatus = propostaAtual.status
    let statusAnterior = propostaAtual.status_anterior_aprovacao
    let aguardandoAprovacao = false

    if (isVendedor) {
      const limite = await parametrosService.getLimiteDescontoVendedor()
      if (
        totais.percentualDescontoTotal > limite &&
        propostaAtual.status !== 'aguardando_aprovacao'
      ) {
        statusAnterior = propostaAtual.status
        novoStatus = 'aguardando_aprovacao'
        aguardandoAprovacao = true
      }
    }

    const propostaAtualizada = await pb.collection('propostas').update<Proposta>(propostaId, {
      subtotal: totais.subtotal,
      desconto_tipo: descontoTipo,
      desconto_valor: valorInformado,
      total_desconto_itens: totais.totalDescontoItens,
      total_desconto_geral: totais.totalDescontoGeral,
      valor_total: totais.totalFinal,
      desconto_aplicado_por: authUser?.id || '',
      desconto_aplicado_em: agoraIso,
      status: novoStatus,
      ...(statusAnterior ? { status_anterior_aprovacao: statusAnterior } : {}),
    })

    return {
      proposta: propostaAtualizada,
      aguardandoAprovacao,
    }
  },

  /**
   * Admin aprova proposta que estava aguardando aprovação
   */
  async aprovarDesconto(propostaId: string): Promise<Proposta> {
    const proposta = await this.getById(propostaId)
    const proximoStatus = proposta.status_anterior_aprovacao || 'em_negociacao'
    const authUser = pb.authStore.record

    await auditoriaDescontosService.registrar({
      proposta: propostaId,
      tipo_alvo: 'geral',
      desconto_tipo: proposta.desconto_tipo || 'valor',
      desconto_valor_informado: proposta.desconto_valor || 0,
      desconto_valor_total:
        (proposta.total_desconto_itens || 0) + (proposta.total_desconto_geral || 0),
      usuario: authUser?.id || '',
      usuario_nome: authUser?.name || authUser?.email || 'Admin',
      usuario_email: authUser?.email || '',
      observacao: `Aprovação de desconto concedida pelo admin. Status restaurado para "${proximoStatus}".`,
    })

    return await pb.collection('propostas').update<Proposta>(propostaId, {
      status: proximoStatus,
      status_anterior_aprovacao: '',
    })
  },

  /**
   * Admin recusa proposta com desconto excedente. Remove os descontos ou redefine status.
   */
  async recusarDesconto(propostaId: string, motivoRecusa?: string): Promise<Proposta> {
    const proposta = await this.getById(propostaId)
    const proximoStatus = proposta.status_anterior_aprovacao || 'rascunho'
    const authUser = pb.authStore.record

    // Auditoria de recusa
    await auditoriaDescontosService.registrar({
      proposta: propostaId,
      tipo_alvo: 'geral',
      desconto_tipo: proposta.desconto_tipo || 'valor',
      desconto_valor_informado: 0,
      desconto_valor_total: 0,
      usuario: authUser?.id || '',
      usuario_nome: authUser?.name || authUser?.email || 'Admin',
      usuario_email: authUser?.email || '',
      observacao: `Desconto RECUSADO pelo admin: ${motivoRecusa || 'Sem justificativa informada'}. Desconto geral zerado.`,
    })

    // Zera desconto geral e restaura status
    const itens = await this.getItems(propostaId)
    const totais = calcularTotaisProposta(itens, 'valor', 0)

    return await pb.collection('propostas').update<Proposta>(propostaId, {
      status: proximoStatus,
      status_anterior_aprovacao: '',
      desconto_tipo: 'valor',
      desconto_valor: 0,
      total_desconto_geral: 0,
      valor_total: totais.totalFinal,
    })
  },

  async updateStatus(id: string, status: PropostaStatus, motivoPerda?: string): Promise<Proposta> {
    const payload: Record<string, any> = { status }
    if (status === 'perdida' && motivoPerda !== undefined) {
      payload.motivo_perda = motivoPerda
    } else if (status !== 'perdida') {
      // Opcional: limpar motivo se reativar ou manter histórico
      if (motivoPerda !== undefined) {
        payload.motivo_perda = motivoPerda
      }
    }
    return await pb.collection('propostas').update<Proposta>(id, payload)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('propostas').delete(id)
  },
}
