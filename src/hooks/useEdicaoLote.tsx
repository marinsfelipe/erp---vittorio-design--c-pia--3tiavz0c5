import { useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Hook reutilizável de SELEÇÃO MÚLTIPLA + EDIÇÃO EM LOTE (exclusivo do admin).
 *
 * Devolve os estado/refs de seleção, uma barra "X selecionados" com o botão
 * "Editar em lote", o cabeçalho com o checkbox "selecionar tudo da página" e o
 * diálogo de campos — tudo pronto para páginas de listagem (Componentes, BOMs).
 *
 * As páginas informam apenas:
 *  - rotuloItem: nome no singular (ex: "componente") para as mensagens;
 *  - campos: quais campos podem ser alterados em lote (com opções de select);
 *  - aplicar: grava a alteração em cada item selecionado, EM SÉRIE
 *    (um update por vez, sem Promise.all — evita rate limit 429 no backend);
 *  - posAplicar: callback para recarregar os dados da listagem.
 */

export interface CampoLoteOpcao {
  value: string
  label: string
}

export interface CampoLote {
  /** chave do campo na coleção (ex: 'unidade', 'ncm') */
  key: string
  label: string
  placeholder?: string
  /** select com opções fixas (tipo, unidade...) */
  opcoes?: CampoLoteOpcao[]
  /** campo de texto livre (fornecedor, categoria, NCM) */
  livre?: boolean
  /** uppercase automático para texto livre */
  uppercase?: boolean
  /** só dígitos, máx 8 (NCM) */
  numerico8?: boolean
  /** select com opções dinâmicas vindas dos dados (categorias/unidades) */
  opcoesDinamicas?: string[]
  /** placeholder do select dinâmico */
  placeholderDinamico?: string
}

const LIMITE_CONFIRMAR = 20

export function useEdicaoLote({
  rotuloItem,
  campos,
  aplicar,
  posAplicar,
}: {
  rotuloItem: string
  campos: CampoLote[]
  aplicar: (
    ids: string[],
    valores: Record<string, string>,
  ) => Promise<{ atualizados: number; erros: number }>
  posAplicar: () => void
}) {
  const { isAdmin } = useAuth()
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [dialogAberto, setDialogAberto] = useState(false)
  const [confirmacao, setConfirmacao] = useState(false)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [aplicando, setAplicando] = useState(false)

  const toggleItem = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const limparSelecao = () => setSelecionados(new Set())

  const selecionarTodos = (ids: string[]) => {
    setSelecionados((prev) => {
      const todos = ids.every((id) => prev.has(id))
      if (todos) {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      }
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
  }

  const abrirDialog = () => {
    setValores({})
    setDialogAberto(true)
  }

  const abrirComConfirmacao = () => {
    if (selecionados.size > LIMITE_CONFIRMAR) {
      setConfirmacao(true)
      return
    }
    abrirDialog()
  }

  const aplicarAgora = async () => {
    const ids = Array.from(selecionados)
    if (ids.length === 0) return

    const escolhidos = Object.entries(valores).filter(([, v]) => v && v.trim() !== '')
    if (escolhidos.length === 0) {
      toast.error('Preencha pelo menos um campo para alterar.')
      return
    }

    setAplicando(true)
    try {
      const payload: Record<string, string> = {}
      for (const [k, v] of escolhidos) payload[k] = v.trim()

      const { atualizados, erros } = await aplicar(ids, payload)

      if (erros > 0) {
        toast.warning(`${atualizados} ${rotuloItem}(s) atualizado(s); ${erros} falha(s).`)
      } else {
        toast.success(`${atualizados} ${rotuloItem}(s) atualizado(s).`)
      }
      setDialogAberto(false)
      setConfirmacao(false)
      limparSelecao()
      posAplicar()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || `Erro ao aplicar alterações em lote.`)
    } finally {
      setAplicando(false)
    }
  }

  const setValor = (key: string, valor: string) => setValores((prev) => ({ ...prev, [key]: valor }))

  /** Barra de ações — renderize somente quando isAdmin && selecionados.size > 0 */
  const barraSelecao = selecionados.size > 0 && (
    <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground flex-1">
        <Pencil className="h-4 w-4 text-primary" />
        <strong>{selecionados.size}</strong> {rotuloItem}
        {selecionados.size > 1 ? 's selecionado' : ' selecionado'}
        {selecionados.size > 1 ? 's' : ''}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={limparSelecao}
        >
          Desselecionar tudo
        </Button>
      </div>
      <Button size="sm" className="gap-1.5" onClick={abrirComConfirmacao} disabled={aplicando}>
        {aplicando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Pencil className="h-3.5 w-3.5" />
        )}
        Editar em lote
      </Button>
    </div>
  )

  /** Checkbox de cabeçalho (selecionar/desselecionar todos da página) */
  const cabecalhoSelecao = (ids: string[]) => {
    const todosMarcados = ids.length > 0 && ids.every((id) => selecionados.has(id))
    const algumMarcado = ids.some((id) => selecionados.has(id))
    return (
      <Checkbox
        checked={todosMarcados ? true : algumMarcado ? 'indeterminate' : false}
        onCheckedChange={() => selecionarTodos(ids)}
        aria-label="Selecionar todos os itens desta página"
        className="mx-auto"
      />
    )
  }

  const colunaCheckbox = (id: string) => (
    <div className="flex items-center justify-center">
      <Checkbox checked={selecionados.has(id)} onCheckedChange={() => toggleItem(id)} />
    </div>
  )

  const dialogo = (
    <Dialog open={dialogAberto} onOpenChange={(o) => !aplicando && setDialogAberto(o)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            Editar em lote — {selecionados.size} {rotuloItem}(s)
          </DialogTitle>
          <DialogDescription>
            Preencha apenas os campos que devem ser alterados em TODOS os itens selecionados. Deixe
            em branco para manter o valor atual de cada item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          {campos.map((campo) => (
            <div key={campo.key} className="space-y-1.5">
              <Label>{campo.label}</Label>
              {campo.opcoes ? (
                <Select
                  value={valores[campo.key] || ''}
                  onValueChange={(v) => setValor(campo.key, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={campo.placeholder || '— não alterar —'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao-alterar">— não alterar —</SelectItem>
                    {campo.opcoes.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : campo.opcoesDinamicas ? (
                <Select
                  value={valores[campo.key] || ''}
                  onValueChange={(v) => setValor(campo.key, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={campo.placeholderDinamico || '— não alterar —'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao-alterar">— não alterar —</SelectItem>
                    {campo.opcoesDinamicas.map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder={campo.placeholder || '— não alterar —'}
                  value={valores[campo.key] || ''}
                  className={
                    campo.uppercase ? 'uppercase font-mono' : campo.numerico8 ? 'font-mono' : ''
                  }
                  inputMode={campo.numerico8 ? 'numeric' : undefined}
                  maxLength={campo.numerico8 ? 8 : undefined}
                  onChange={(e) => {
                    let v = e.target.value
                    if (campo.numerico8) v = v.replace(/\D/g, '').slice(0, 8)
                    if (campo.uppercase) v = v.toUpperCase()
                    setValor(campo.key, v)
                  }}
                />
              )}
              {campo.numerico8 && (
                <p className="text-[11px] text-muted-foreground">
                  O NCM deve conter exatamente 8 dígitos. Fica com origem Manual e nunca é
                  sobrescrito pela classificação automática.
                </p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={aplicando}>
            Cancelar
          </Button>
          <Button onClick={aplicarAgora} disabled={aplicando} className="gap-1.5">
            {aplicando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {aplicando ? 'Aplicando...' : `Aplicar a ${selecionados.size} item(ns)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const confirmDialog = (
    <Dialog open={confirmacao} onOpenChange={(o) => !aplicando && setConfirmacao(o)}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            Aplicar a {selecionados.size} {rotuloItem}(s)?
          </DialogTitle>
          <DialogDescription>
            A seleção é grande. Os campos preenchidos serão gravados em todos os itens de uma vez.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmacao(false)} disabled={aplicando}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              setConfirmacao(false)
              abrirDialog()
            }}
            disabled={aplicando}
          >
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return {
    isAdmin,
    selecionados: Array.from(selecionados),
    totalSelecionados: selecionados.size,
    toggleItem,
    selecionarTodos,
    limparSelecao,
    barraSelecao,
    cabecalhoSelecao,
    colunaCheckbox,
    dialogo,
    confirmDialog,
  }
}
