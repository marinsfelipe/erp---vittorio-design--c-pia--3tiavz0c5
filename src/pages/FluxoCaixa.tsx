// Página Fluxo de Caixa — Módulo Financeiro (admin-only).
// Visões REALIZADA (baixas) e PREVISTA (vencimentos), navegação mensal/por ano,
// entradas, saídas, saldo do mês e saldo acumulado + exportação .xlsx.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { formatBRL } from '@/utils/formatters'
import {
  dataPB,
  entradasPrevistasPorMes,
  entradasRealizadasPorMes,
  fluxoCaixaService,
  mesDeChave,
  saidasPrevistasPorMes,
  saidasRealizadasPorMes,
  type MesFluxo,
  type VisaoFluxo,
} from '@/services/fluxoCaixa'
import { exportarFluxoCaixaXlsx, nomeMes } from '@/utils/financeiroExport'
import { Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContaPagar, ContaReceber } from '@/types/financeiro'

interface DetalheLinha {
  titulo: string
  itens: { descricao: string; valor: number; data: string; status: string }[]
  total: number
}

const NOMES_MESES_ABREV = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export default function FluxoCaixaPage() {
  const { toast } = useToast()
  const [receber, setReceber] = useState<ContaReceber[]>([])
  const [pagar, setPagar] = useState<ContaPagar[]>([])
  const [carregando, setCarregando] = useState(true)
  const [visao, setVisao] = useState<VisaoFluxo>('realizada')

  const agora = new Date()
  const [chaveSelecionada, setChaveSelecionada] = useState(
    agora.getFullYear() * 12 + agora.getMonth(),
  )
  const [anoNavegado, setAnoNavegado] = useState(agora.getFullYear())

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const dados = await fluxoCaixaService.listarTudo()
      setReceber(dados.receber)
      setPagar(dados.pagar)
    } catch (err) {
      console.error('Erro ao carregar fluxo de caixa', err)
      toast({
        title: 'Erro ao carregar fluxo de caixa',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => {
    carregar()
  }, [carregar])

  const meses = useMemo<MesFluxo[]>(() => {
    if (visao === 'realizada') {
      return (function () {
        const rec = entradasRealizadasPorMes(receber)
        const desp = saidasRealizadasPorMes(pagar)
        // acumulado inclui TODOS os meses anteriores (antes do ano exibido)
        const de = Math.min(...[...new Set([...rec.keys(), ...desp.keys(), anoNavegado * 12])])
        let acumuladoAnterior = 0
        for (let c = de; c < anoNavegado * 12; c++) {
          acumuladoAnterior += (rec.get(c) || 0) - (desp.get(c) || 0)
        }
        const lista: MesFluxo[] = []
        for (let i = 0; i < 12; i++) {
          const chave = anoNavegado * 12 + i
          const { ano, mes } = mesDeChave(chave)
          const entradas = rec.get(chave) || 0
          const saidas = desp.get(chave) || 0
          const saldo = entradas - saidas
          acumuladoAnterior += saldo
          lista.push({ ano, mes, entradas, saidas, saldo, saldoAcumulado: acumuladoAnterior })
        }
        return lista
      })()
    }
    // PREVISTA: só faz sentido olhar adiante — acumulado começa em 0 no mês corrente
    const rec = entradasPrevistasPorMes(receber)
    const desp = saidasPrevistasPorMes(pagar)
    const { ano: anoAtual, mes: mesAtual } = mesDeChave(chaveSelecionada)
    let acumulado = 0
    const lista: MesFluxo[] = []
    for (let i = 0; i < 12; i++) {
      const chave = anoNavegado * 12 + i
      const { ano, mes } = mesDeChave(chave)
      const antesDoMesCorrente = ano < anoAtual || (ano === anoAtual && mes < mesAtual)
      const entradas = rec.get(chave) || 0
      const saidas = desp.get(chave) || 0
      const saldo = entradas - saidas
      if (!antesDoMesCorrente) acumulado += saldo
      lista.push({
        ano,
        mes,
        entradas: antesDoMesCorrente ? 0 : entradas,
        saidas: antesDoMesCorrente ? 0 : saidas,
        saldo: antesDoMesCorrente ? 0 : saldo,
        saldoAcumulado: acumulado,
      })
    }
    return lista
  }, [visao, receber, pagar, anoNavegado, chaveSelecionada])

  const detalhe = useMemo<DetalheLinha | null>(() => {
    const { ano, mes } = mesDeChave(chaveSelecionada)
    const itens: DetalheLinha['itens'] = []
    if (visao === 'realizada') {
      for (const c of receber) {
        if (!c.data_recebimento || !c.valor_recebido) continue
        const d = new Date(c.data_recebimento)
        if (d.getFullYear() !== ano || d.getMonth() + 1 !== mes) continue
        itens.push({
          descricao: `${c.cliente_nome} — ${c.faturamento_numero} (${c.numero_parcela}/${c.total_parcelas})`,
          valor: Number(c.valor_recebido) || 0,
          data: d.toLocaleDateString('pt-BR'),
          status: 'Recebido',
        })
      }
      for (const c of pagar) {
        if (!c.data_pagamento || !c.valor_pago) continue
        const d = new Date(c.data_pagamento)
        if (d.getFullYear() !== ano || d.getMonth() + 1 !== mes) continue
        itens.push({
          descricao: `${c.fornecedor}${c.descricao ? ` — ${c.descricao}` : ''}`,
          valor: -(Number(c.valor_pago) || 0),
          data: d.toLocaleDateString('pt-BR'),
          status: 'Pago',
        })
      }
    } else {
      const hojeZero = new Date()
      hojeZero.setHours(0, 0, 0, 0)
      for (const c of receber) {
        if (c.status === 'cancelado' || c.status === 'pago') continue
        const saldo = Math.max(0, (Number(c.valor_parcela) || 0) - (Number(c.valor_recebido) || 0))
        if (saldo <= 0) continue
        const venc = new Date(c.vencimento)
        if (venc.getFullYear() !== ano || venc.getMonth() + 1 !== mes) continue
        itens.push({
          descricao: `${c.cliente_nome} — ${c.faturamento_numero} (${c.numero_parcela}/${c.total_parcelas})`,
          valor: saldo,
          data: venc.toLocaleDateString('pt-BR'),
          status: venc < hojeZero ? 'Atrasado' : 'Previsto',
        })
      }
      for (const c of pagar) {
        if (c.status === 'cancelado' || c.status === 'pago') continue
        const saldo = Math.max(0, (Number(c.valor) || 0) - (Number(c.valor_pago) || 0))
        if (saldo <= 0) continue
        const venc = new Date(c.vencimento)
        if (venc.getFullYear() !== ano || venc.getMonth() + 1 !== mes) continue
        itens.push({
          descricao: `${c.fornecedor}${c.descricao ? ` — ${c.descricao}` : ''}`,
          valor: -saldo,
          data: venc.toLocaleDateString('pt-BR'),
          status: venc < hojeZero ? 'Atrasado' : 'Previsto',
        })
      }
    }
    if (itens.length === 0) return null
    return {
      titulo: `Movimentos de ${nomeMes(mes)}/${ano} (${visao === 'realizada' ? 'Realizada' : 'Prevista'})`,
      itens: itens.sort((a, b) => (a.data > b.data ? 1 : -1)),
      total: itens.reduce((s, i) => s + i.valor, 0),
    }
  }, [visao, receber, pagar, chaveSelecionada])

  function navegarMes(delta: number) {
    const nova = chaveSelecionada + delta
    setChaveSelecionada(nova)
    setAnoNavegado(mesDeChave(nova).ano)
  }

  function trocarAno(ano: number) {
    setAnoNavegado(ano)
    const { mes } = mesDeChave(chaveSelecionada)
    setChaveSelecionada(ano * 12 + (mes - 1))
  }

  const selecionado = mesDeChave(chaveSelecionada)
  const anosDisponiveis = useMemo(() => {
    const base = new Date().getFullYear()
    return [base - 2, base - 1, base, base + 1, base + 2]
  }, [])

  const mesSelecionado = meses.find((m) => m.ano === selecionado.ano && m.mes === selecionado.mes)

  function exportar() {
    if (meses.length === 0) return
    exportarFluxoCaixaXlsx(meses, visao === 'realizada' ? 'Realizada' : 'Prevista', anoNavegado)
    toast({ title: 'Fluxo de caixa exportado', description: 'Arquivo .xlsx gerado com 12 meses.' })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fluxo de Caixa</h1>
          <p className="text-muted-foreground text-sm">
            Entradas e saídas por mês, com saldo do mês e acumulado. Visão{' '}
            {visao === 'realizada' ? 'realizada (baixas efetivadas)' : 'prevista (vencimentos)'}.
          </p>
        </div>
        <Button variant="outline" onClick={exportar} disabled={carregando}>
          <Download className="mr-2 h-4 w-4" /> Exportar .xlsx
        </Button>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => navegarMes(-1)}>
            ←
          </Button>
          <Button variant="outline" size="sm" onClick={() => navegarMes(1)}>
            →
          </Button>
          <span className="ml-2 text-sm font-medium">
            Mês selecionado: {nomeMes(selecionado.mes)}/{selecionado.ano}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => trocarAno(anoNavegado - 1)}>
            ←
          </Button>
          <span className="min-w-[52px] text-center text-sm font-medium">{anoNavegado}</span>
          <Button variant="outline" size="sm" onClick={() => trocarAno(anoNavegado + 1)}>
            →
          </Button>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          {(['realizada', 'prevista'] as VisaoFluxo[]).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={visao === v ? 'default' : 'ghost'}
              onClick={() => setVisao(v)}
            >
              {v === 'realizada' ? 'Realizada' : 'Prevista'}
            </Button>
          ))}
        </div>
      </div>

      {carregando ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando fluxo de caixa...
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tabela dos 12 meses do ano navegado */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Ano {anoNavegado} — visão {visao === 'realizada' ? 'REALIZADA' : 'PREVISTA'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Mês</th>
                      <th className="px-4 py-3 text-right font-medium">Entradas</th>
                      <th className="px-4 py-3 text-right font-medium">Saídas</th>
                      <th className="px-4 py-3 text-right font-medium">Saldo do mês</th>
                      <th className="px-4 py-3 text-right font-medium">Saldo acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meses.map((m) => {
                      const ativo = m.ano === selecionado.ano && m.mes === selecionado.mes
                      return (
                        <tr
                          key={`${m.ano}-${m.mes}`}
                          className={cn(
                            'cursor-pointer border-b last:border-0 hover:bg-muted/40',
                            ativo && 'bg-muted/60 font-medium',
                          )}
                          onClick={() => setChaveSelecionada(m.ano * 12 + (m.mes - 1))}
                        >
                          <td className="px-4 py-2.5">
                            {NOMES_MESES_ABREV[m.mes - 1]}/{m.ano}
                          </td>
                          <td className="px-4 py-2.5 text-right text-green-600">
                            {formatBRL(m.entradas)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-red-600">
                            {formatBRL(m.saidas)}
                          </td>
                          <td
                            className={cn(
                              'px-4 py-2.5 text-right',
                              m.saldo < 0 ? 'text-red-600' : '',
                            )}
                          >
                            {formatBRL(m.saldo)}
                          </td>
                          <td
                            className={cn(
                              'px-4 py-2.5 text-right font-semibold',
                              m.saldoAcumulado < 0 ? 'text-red-600' : '',
                            )}
                          >
                            {formatBRL(m.saldoAcumulado)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Detalhe do mês selecionado */}
          {mesSelecionado && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {nomeMes(mesSelecionado.mes)}/{mesSelecionado.ano} — entradas{' '}
                  {formatBRL(mesSelecionado.entradas)}, saídas {formatBRL(mesSelecionado.saidas)},
                  saldo {formatBRL(mesSelecionado.saldo)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!detalhe ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum movimento {visao === 'realizada' ? 'realizado' : 'previsto'} neste mês.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Data</th>
                          <th className="px-4 py-2 font-medium">Descrição</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                          <th className="px-4 py-2 text-right font-medium">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.itens.map((it, idx) => (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="whitespace-nowrap px-4 py-2">{it.data}</td>
                            <td className="px-4 py-2">{it.descricao}</td>
                            <td className="px-4 py-2">{it.status}</td>
                            <td
                              className={cn(
                                'whitespace-nowrap px-4 py-2 text-right',
                                it.valor < 0 ? 'text-red-600' : 'text-green-600',
                              )}
                            >
                              {formatBRL(it.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
