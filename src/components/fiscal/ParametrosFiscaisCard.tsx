import { useEffect, useMemo, useState } from 'react'
import { fiscalService } from '@/services/fiscal'
import { parametrosService } from '@/services/parametros'
import type { Parametro } from '@/types/erp'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Receipt, Save, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { formatBRL } from '@/utils/formatters'

/** Card de configuração dos parâmetros fiscais — mesmo padrão dos cards de Contas a Receber/Pagar. */
export default function ParametrosFiscaisCard() {
  const [params, setParams] = useState<Parametro[]>([])
  const [editados, setEditados] = useState<Record<string, number>>({})
  const [editadosTexto, setEditadosTexto] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const load = async () => {
    setIsLoading(true)
    try {
      const lista = await fiscalService.listarParametrosFiscais()
      setParams(lista)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar parâmetros fiscais.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const setValor = (chave: string, valor: string) => {
    const num = parseFloat(valor.replace(',', '.'))
    setEditados((prev) => ({ ...prev, [chave]: isNaN(num) ? 0 : num }))
  }

  const salvar = async () => {
    setIsSaving(true)
    try {
      for (const [chave, valor] of Object.entries(editados)) {
        await parametrosService.update(chave, valor)
      }
      for (const [chave, valor] of Object.entries(editadosTexto)) {
        const rec = params.find((p) => p.chave === chave)
        if (rec) await parametrosService.updateTexto(rec.id, valor)
      }
      setEditados({})
      setEditadosTexto({})
      toast.success('Parâmetros fiscais salvos.')
      load()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao salvar parâmetros fiscais.')
    } finally {
      setIsSaving(false)
    }
  }

  const faixasAnexo2 = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6].map((i) => ({
        i,
        limite:
          editados[`fiscal_anexo2_faixa${i}_limite`] ?? valorDe(`fiscal_anexo2_faixa${i}_limite`),
        aliquota:
          editados[`fiscal_anexo2_faixa${i}_aliquota`] ??
          valorDe(`fiscal_anexo2_faixa${i}_aliquota`),
        deducao:
          editados[`fiscal_anexo2_faixa${i}_deducao`] ?? valorDe(`fiscal_anexo2_faixa${i}_deducao`),
      })),
    [params, editados],
  )

  const valorDe = (chave: string): number =>
    editados[chave] ?? params.find((p) => p.chave === chave)?.valor_percentual ?? 0

  const textoDe = (chave: string): string =>
    editadosTexto[chave] ?? params.find((p) => p.chave === chave)?.valor_texto ?? ''

  const setTexto = (chave: string, valor: string) =>
    setEditadosTexto((prev) => ({ ...prev, [chave]: valor }))

  const ufs = [
    'AC',
    'AL',
    'AM',
    'AP',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MG',
    'MS',
    'MT',
    'PA',
    'PB',
    'PE',
    'PI',
    'PR',
    'RJ',
    'RN',
    'RO',
    'RR',
    'RS',
    'SC',
    'SE',
    'SP',
    'TO',
  ]

  const limpar = () => {
    setEditados({})
    setEditadosTexto({})
  }

  const totalEditados = Object.keys(editados).length + Object.keys(editadosTexto).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Parâmetros Fiscais (estimativas)</CardTitle>
        </div>
        <CardDescription>
          Tabelas usadas no cálculo ESTIMATIVO de impostos por faturamento. Apuração oficial pelo
          contador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando parâmetros...</p>
        ) : (
          <Tabs defaultValue="anexo2">
            <TabsList>
              <TabsTrigger value="anexo2">Simples Nacional — Anexo II</TabsTrigger>
              <TabsTrigger value="presumido">Lucro Presumido</TabsTrigger>
              <TabsTrigger value="icms">ICMS por UF</TabsTrigger>
              <TabsTrigger value="ncm">NCMs com IPI 5%</TabsTrigger>
            </TabsList>

            {/* ---------------- Simples Nacional (Anexo II) ---------------- */}
            <TabsContent value="anexo2" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Tabela do Anexo II (indústria). Alíquota efetiva = (RBT12 × alíquota nominal −
                dedução) ÷ RBT12.
              </p>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs">Faixa</TableHead>
                      <TableHead className="text-xs">Limite (RBT12)</TableHead>
                      <TableHead className="text-xs">Alíquota nominal (%)</TableHead>
                      <TableHead className="text-xs">Dedução (R$)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {faixasAnexo2.map((f) => (
                      <TableRow key={f.i} className="text-xs">
                        <TableCell className="font-mono font-semibold">{f.i}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={String(f.limite)}
                            onChange={(e) =>
                              setValor(`fiscal_anexo2_faixa${f.i}_limite`, e.target.value)
                            }
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={String(f.aliquota)}
                            onChange={(e) =>
                              setValor(`fiscal_anexo2_faixa${f.i}_aliquota`, e.target.value)
                            }
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={String(f.deducao)}
                            onChange={(e) =>
                              setValor(`fiscal_anexo2_faixa${f.i}_deducao`, e.target.value)
                            }
                            className="h-8 text-xs"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ----------------------- Lucro Presumido ---------------------- */}
            <TabsContent value="presumido" className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">PIS (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={String(valorDe('fiscal_pis'))}
                    onChange={(e) => setValor('fiscal_pis', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">COFINS (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={String(valorDe('fiscal_cofins'))}
                    onChange={(e) => setValor('fiscal_cofins', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ICMS interestadual (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={String(valorDe('fiscal_icms_interestadual'))}
                    onChange={(e) => setValor('fiscal_icms_interestadual', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">IPI por NCM (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={String(valorDe('fiscal_ipi'))}
                    onChange={(e) => setValor('fiscal_ipi', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </TabsContent>

            {/* ------------------------ ICMS por UF ------------------------- */}
            <TabsContent value="icms" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Alíquota interna de ICMS por UF do cliente (interestadual usa a taxa da aba Lucro
                Presumido).
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {ufs.map((uf) => (
                  <div key={uf} className="space-y-1">
                    <Label className="text-[10px] font-mono">{uf}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={String(valorDe(`fiscal_icms_uf_${uf.toLowerCase()}`))}
                      onChange={(e) =>
                        setValor(`fiscal_icms_uf_${uf.toLowerCase()}`, e.target.value)
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* --------------------- NCMs com IPI 5% ------------------------ */}
            <TabsContent value="ncm" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Códigos NCM (8 dígitos) que recebem IPI na alíquota do parâmetro "IPI por NCM (%)"
                da aba Lucro Presumido. Separe por vírgula (ex.: 84185010, 84186990).
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Lista de NCMs</Label>
                <Input
                  value={textoDe('fiscal_ipi_ncm_5')}
                  onChange={(e) => setTexto('fiscal_ipi_ncm_5', e.target.value)}
                  placeholder="84185010, 84186990"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  {
                    textoDe('fiscal_ipi_ncm_5')
                      .split(',')
                      .map((c) => c.trim())
                      .filter(Boolean).length
                  }{' '}
                  NCM(s) cadastrado(s)
                </p>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex items-center gap-2 mt-4">
          <Button
            onClick={salvar}
            disabled={isSaving || totalEditados === 0}
            className="gap-1.5 text-xs"
          >
            <Save className="h-3.5 w-3.5" />
            Salvar
          </Button>
          <Button
            variant="outline"
            onClick={limpar}
            disabled={totalEditados === 0}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Descartar
          </Button>
          {totalEditados > 0 && (
            <span className="text-xs text-amber-600">
              {totalEditados} alteração(ões) não salva(s)
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
