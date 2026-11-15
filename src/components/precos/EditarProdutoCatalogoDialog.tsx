import { useState } from 'react'
import type { Bom } from '@/types/erp'
import { bomsService } from '@/services/boms'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { formatarCest } from '@/components/precos/CestCell'

/**
 * Botão + diálogo para o admin editar as características de um produto do
 * Catálogo (nome, descrição e NCM). Persiste direto no registro do BOM no
 * banco — o Catálogo recarrega após salvar (via onChanged).
 */
export default function EditarProdutoCatalogoDialog({
  bom,
  podeAdmin,
  onChanged,
}: {
  bom: Bom
  podeAdmin: boolean
  onChanged: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState(bom.nome || '')
  const [descricao, setDescricao] = useState(bom.descricao || '')
  const [ncm, setNcm] = useState((bom.ncm || '').replace(/\D/g, ''))
  const [cest, setCest] = useState(bom.cest || '')

  const abrir = () => {
    setNome(bom.nome || '')
    setDescricao(bom.descricao || '')
    setNcm((bom.ncm || '').replace(/\D/g, ''))
    setCest(bom.cest || '')
    setAberto(true)
  }

  const salvar = async () => {
    const ncmLimpo = ncm.replace(/\D/g, '')
    if (ncmLimpo && ncmLimpo.length !== 8) {
      toast.error('O NCM deve conter exatamente 8 dígitos numéricos.')
      return
    }
    if (!nome.trim()) {
      toast.error('Informe o nome do produto.')
      return
    }
    const cestLimpo = cest.replace(/\D/g, '')
    if (cestLimpo && cestLimpo.length !== 7) {
      toast.error('O CEST deve conter 7 dígitos no formato XX.XXX.XX.')
      return
    }
    setSalvando(true)
    try {
      await bomsService.update(bom.id, {
        nome: nome.trim(),
        descricao: descricao.trim(),
        ...(ncmLimpo
          ? {
              ncm: ncmLimpo,
              ncm_origem: bom.ncm_origem === 'manual' || !bom.ncm ? 'manual' : bom.ncm_origem,
              ncm_status: 'pronto_nf',
            }
          : {}),
        cest: cestLimpo ? formatarCest(cestLimpo) : '',
      } as any)
      toast.success('Características do produto salvas.')
      setAberto(false)
      onChanged()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar as características do produto.')
    } finally {
      setSalvando(false)
    }
  }

  if (!podeAdmin) {
    return null
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
        onClick={abrir}
      >
        <Pencil className="h-3 w-3" /> Editar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar produto</DialogTitle>
            <DialogDescription>
              SKU <strong className="font-mono">{bom.sku}</strong> — nome, descrição e NCM ficam
              salvos no cadastro do produto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Nome do produto</label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Descrição / Aplicação</label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Destinado à conservação e exposição de carnes e frios"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">NCM (8 dígitos)</label>
              <Input
                value={ncm}
                onChange={(e) => setNcm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Ex: 84185010"
                className="font-mono"
                inputMode="numeric"
                maxLength={8}
              />
              <p className="text-[11px] text-muted-foreground">
                Preenchido manualmente, fica com origem "Manual" — o lote automático nunca
                sobrescreve.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">CEST (opcional — XX.XXX.XX)</label>
              <Input
                value={cest}
                onChange={(e) => setCest(formatarCest(e.target.value))}
                placeholder="Ex: 21.007.00"
                className="font-mono"
                maxLength={9}
              />
              <p className="text-[11px] text-muted-foreground">
                Obrigatório na NF apenas quando o item é sujeito a substituição tributária.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
