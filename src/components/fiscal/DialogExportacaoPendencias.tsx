// Fiscal F4 — Bloqueio de exportação de pré-nota com item "pendente fiscal".
//
// Vendedor/usuário comum: só vê a mensagem de bloqueio (não há como exportar).
// Admin: pode liberar a exportação mesmo com pendências (checkbox de
// confirmação — o item segue na planilha com NCM em branco, sinalizado).

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertTriangle, FileSpreadsheet, ShieldAlert } from 'lucide-react'
import type { Faturamento } from '@/types/erp'

interface Props {
  fat: Faturamento | null
  /** Só verdadeiro quando o usuário é admin — controla a liberação. */
  isAdmin: boolean
  onFechar: () => void
  /** Chamado quando o admin confirma a exportação mesmo com pendências. */
  onConfirmarLiberacao: (fat: Faturamento) => void
}

export default function DialogExportacaoPendencias({
  fat,
  isAdmin,
  onFechar,
  onConfirmarLiberacao,
}: Props) {
  const [liberado, setLiberado] = useState(false)

  // Reata o checkbox sempre que um novo bloqueio abre
  const chave = fat?.id || ''
  const [ultimoId, setUltimoId] = useState(chave)
  if (chave !== ultimoId) {
    setUltimoId(chave)
    setLiberado(false)
  }

  if (!fat) return null

  const pendentes = (fat.produtos || []).filter((p) => !(p.ncm || '').trim())

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <ShieldAlert className="h-5 w-5" />
            Pré-nota com pendência fiscal
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm space-y-3">
              <p>
                A pré-nota <span className="font-mono font-semibold">{fat.numero}</span> tem{' '}
                <span className="font-semibold">{pendentes.length} item(ns)</span> sem NCM
                cadastrado. A exportação para o escritório contábil está bloqueada.
              </p>
              <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 max-h-44 overflow-y-auto">
                <ul className="list-disc list-inside text-xs font-mono space-y-0.5 text-amber-800 dark:text-amber-300">
                  {pendentes.map((p, i) => (
                    <li key={i}>
                      {p.sku || 'sem SKU'} — {p.descricao || 'produto sem descrição'}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                Cadastre o NCM no produto (módulo BOMs) para liberar a exportação.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {isAdmin && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
            <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <Checkbox
                checked={liberado}
                onCheckedChange={(v) => setLiberado(v === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">
                  Liberar exportação mesmo com pendências fiscais
                </span>
                <span className="block text-muted-foreground">
                  Somente administrador. Os itens seguem na planilha com NCM em branco para
                  preenchimento do contador.
                </span>
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onFechar}>
            Fechar
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              disabled={!liberado}
              onClick={() => onConfirmarLiberacao(fat)}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar mesmo assim
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
