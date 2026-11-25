import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Bom } from '@/types/erp'
import { bomsService } from '@/services/boms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Search, Check, Copy, Loader2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** BOMs existentes — origem e destino são escolhidos entre elas. */
  boms: Bom[]
  /** Executado após a cópia concluir (recarregar listagem). */
  onCopied?: () => void
}

/**
 * Diálogo "Reaproveitar lista" (exclusivo do admin): escolhe a BOM de ORIGEM
 * (lista a copiar) e a BOM de DESTINO (equipamento que receberá os itens). A
 * cópia é feita EM SÉRIE pelo serviço (um create por vez, sem Promise.all), a
 * origem fica INTACTA e, ao concluir, navega direto ao editor da nova BOM.
 */
export function ReaproveitarListaDialog({ open, onOpenChange, boms, onCopied }: Props) {
  const navigate = useNavigate()
  const [buscaOrigem, setBuscaOrigem] = useState('')
  const [buscaDestino, setBuscaDestino] = useState('')
  const [origem, setOrigem] = useState<Bom | null>(null)
  const [destino, setDestino] = useState<Bom | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const filtrar = (q: string) => {
    const termo = q.trim().toLowerCase()
    if (!termo) return []
    return boms
      .filter((b) => `${b.sku} ${b.nome} ${b.descricao || ''}`.toLowerCase().includes(termo))
      .slice(0, 30)
  }

  const resultadosOrigem = filtrar(buscaOrigem)
  const resultadosDestino = filtrar(buscaDestino)

  const reset = () => {
    setBuscaOrigem('')
    setBuscaDestino('')
    setOrigem(null)
    setDestino(null)
  }

  const handleClose = (o: boolean) => {
    if (!o) reset()
    onOpenChange(o)
  }

  const handleCopiar = async () => {
    if (!origem || !destino) return
    if (origem.id === destino.id) {
      toast.error('A BOM de origem e a de destino não podem ser a mesma.')
      return
    }
    setIsSaving(true)
    try {
      const { itensCopiados } = await bomsService.copiarLista(origem.id, destino.id)
      toast.success(
        `Lista copiada: ${itensCopiados} item(ns) de ${origem.sku} → ${destino.sku}. A origem permanece intacta.`,
      )
      handleClose(false)
      onCopied?.()
      navigate(`/boms/${destino.id}`)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao reaproveitar a lista. Veja o console para detalhes.')
    } finally {
      setIsSaving(false)
    }
  }

  // Seletor de BOM reutilizável (busca por código/nome, mesmo padrão da UI)
  const seletor = (
    rotulo: string,
    bomSelecionada: Bom | null,
    busca: string,
    setBusca: (v: string) => void,
    selecionar: (b: Bom) => void,
    limpar: () => void,
    resultados: Bom[],
    desabilitarId?: string,
  ) => (
    <div className="space-y-2">
      <Label>{rotulo}</Label>
      {bomSelecionada ? (
        <div className="flex items-center gap-2 text-xs bg-primary/5 border border-primary/20 rounded-lg p-2">
          <Check className="h-4 w-4 text-primary shrink-0" />
          <span className="font-mono font-semibold text-primary">{bomSelecionada.sku}</span>
          <span className="truncate flex-1">{bomSelecionada.nome}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={limpar}
          >
            Trocar
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código ou nome..."
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label={rotulo}
          />
        </div>
      )}
      {!bomSelecionada && resultados.length > 0 && (
        <div className="border border-border rounded-lg max-h-44 overflow-y-auto divide-y divide-border">
          {resultados.map((b) => {
            const indisponivel = desabilitarId ? b.id === desabilitarId : false
            return (
              <div
                key={b.id}
                role="button"
                tabIndex={indisponivel ? -1 : 0}
                aria-disabled={indisponivel}
                onClick={() => !indisponivel && selecionar(b)}
                onKeyDown={(e) => {
                  if (indisponivel) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selecionar(b)
                  }
                }}
                className={`p-2.5 flex items-center justify-between ${
                  indisponivel
                    ? 'opacity-50 cursor-not-allowed bg-muted/30'
                    : 'cursor-pointer hover:bg-muted/50'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{b.sku}</span>
                    <span className="text-xs text-muted-foreground truncate">{b.nome}</span>
                  </div>
                </div>
                {indisponivel && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    Igual ao outro lado
                  </Badge>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" />
            Reaproveitar lista
          </DialogTitle>
          <DialogDescription>
            Copia todos os itens de uma BOM existente (origem) para outra BOM (destino), remapeando
            a hierarquia. A BOM de origem permanece intacta. Após concluir, o editor da BOM de
            destino abre para os ajustes finos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {seletor(
            'BOM de origem (lista a copiar) *',
            origem,
            buscaOrigem,
            setBuscaOrigem,
            setOrigem,
            () => setOrigem(null),
            resultadosOrigem,
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ArrowRight className="h-4 w-4" />
            Os itens serão copiados de cima para baixo, mantendo níveis e quantidades.
          </div>
          {seletor(
            'BOM de destino (equipamento que receberá a lista) *',
            destino,
            buscaDestino,
            setBuscaDestino,
            setDestino,
            () => setDestino(null),
            resultadosDestino,
            origem?.id,
          )}
          {origem && destino && origem.id === destino.id && (
            <p className="text-xs text-destructive">
              A origem e o destino são a mesma BOM — escolha destinos diferentes.
            </p>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleCopiar}
            disabled={isSaving || !origem || !destino || origem.id === destino.id}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Copiando...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copiar lista
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
