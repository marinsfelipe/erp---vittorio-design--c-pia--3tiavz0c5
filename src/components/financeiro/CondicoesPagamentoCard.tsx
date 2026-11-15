import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Pencil, Settings2 } from 'lucide-react'
import { contasReceberService, ROTULO_CONDICOES } from '@/services/contasReceber'
import type { CondicaoPagamento } from '@/types/financeiro'

/**
 * Card de CONDIÇÕES DE PAGAMENTO configuráveis pelo admin (exibido na página
 * Contas a Receber). As condições vivem na coleção `parametros` com chaves
 * `financeiro_condicao_*` — `valor_percentual` guarda o prazo em DIAS da
 * parcela (0 = à vista). Não entram no markup divisor.
 */
export default function CondicoesPagamentoCard() {
  const { toast } = useToast()
  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [diasEdit, setDiasEdit] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setCondicoes(await contasReceberService.listarCondicoes())
    } catch (err) {
      console.error('Erro ao carregar condições de pagamento', err)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  function iniciarEdicao(c: CondicaoPagamento) {
    setEditandoId(c.id)
    setDiasEdit(String(c.dias))
  }

  async function salvar(c: CondicaoPagamento) {
    const dias = Number(diasEdit)
    if (Number.isNaN(dias) || dias < 0 || dias > 365) {
      toast({
        title: 'Prazo inválido',
        description: 'Informe um prazo entre 0 e 365 dias.',
        variant: 'destructive',
      })
      return
    }
    setSalvando(true)
    try {
      await contasReceberService.salvarCondicao({ ...c, dias })
      toast({ title: 'Condição atualizada', description: `${c.nome}: ${dias} dia(s).` })
      setEditandoId(null)
      await carregar()
    } catch (err) {
      console.error('Erro ao salvar condição', err)
      toast({ title: 'Erro ao salvar condição', description: String(err), variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Settings2 className="h-4 w-4" />
          Condições de pagamento
          <span className="ml-auto text-xs font-normal">
            prazos usados na geração automática das parcelas
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando condições...
          </div>
        ) : condicoes.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhuma condição configurada (padrão: à vista).
          </p>
        ) : (
          <div className="space-y-2">
            {condicoes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{ROTULO_CONDICOES[c.chave] || c.nome}</p>
                  {c.descricao && (
                    <p className="truncate text-xs text-muted-foreground">{c.descricao}</p>
                  )}
                </div>
                {editandoId === c.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      className="h-8 w-24"
                      value={diasEdit}
                      onChange={(e) => setDiasEdit(e.target.value)}
                      autoFocus
                    />
                    <span className="text-xs text-muted-foreground">dias</span>
                    <Button size="sm" onClick={() => salvar(c)} disabled={salvando}>
                      {salvando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditandoId(null)}
                      disabled={salvando}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold whitespace-nowrap">
                      {c.dias === 0 ? 'na emissão' : `${c.dias} dia(s)`}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => iniciarEdicao(c)}
                      className="gap-1"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
