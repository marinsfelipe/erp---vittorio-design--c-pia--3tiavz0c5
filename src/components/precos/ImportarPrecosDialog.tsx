import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  PlusCircle,
  RefreshCw,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatBRL } from '@/utils/formatters'
import {
  baixarModeloImportacaoPrecos,
  lerPlanilhaPrecos,
  mapearLinhasPrecos,
  type DecisaoImportacao,
  type ProblemaLinha,
  type PreviewImportacaoPrecos,
} from '@/utils/precosImportParser'
import {
  classificarLinhas,
  gravarImportacaoPrecos,
  type ResultadoImportacaoPrecos,
} from '@/services/precosImport'

interface ImportarPrecosDialogProps {
  onImported: () => void
}

type Etapa = 'arquivo' | 'preview' | 'importando' | 'resumo'

export default function ImportarPrecosDialog({ onImported }: ImportarPrecosDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>('arquivo')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [preview, setPreview] = useState<PreviewImportacaoPrecos | null>(null)
  const [progresso, setProgresso] = useState(0)
  const [msgProgresso, setMsgProgresso] = useState('')
  const [resultado, setResultado] = useState<ResultadoImportacaoPrecos | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const reset = () => {
    setEtapa('arquivo')
    setNomeArquivo('')
    setPreview(null)
    setProgresso(0)
    setMsgProgresso('')
    setResultado(null)
    setIsProcessing(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFechar = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    setOpen(nextOpen)
  }

  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsProcessing(true)
    try {
      const rows = await lerPlanilhaPrecos(file)
      const linhas = mapearLinhasPrecos(rows)
      if (linhas.length === 0) {
        toast.error('Nenhuma linha encontrada na planilha. Verifique o cabeçalho e o conteúdo.')
        return
      }
      setNomeArquivo(file.name)
      const p = await classificarLinhas(linhas)
      setPreview(p)
      setEtapa('preview')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao ler o arquivo. Use .xlsx ou .csv.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImportar = async () => {
    if (!preview || preview.validas.length === 0) return
    setEtapa('importando')
    setIsProcessing(true)
    setProgresso(0)
    try {
      const res = await gravarImportacaoPrecos(preview.validas, (msg, pct) => {
        setMsgProgresso(msg)
        setProgresso(pct)
      })
      setResultado(res)
      setEtapa('resumo')
      onImported()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro durante a importação.')
      setEtapa('preview')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => setOpen(true)}>
        <Upload className="h-3.5 w-3.5" />
        Importar preços
      </Button>

      <Dialog open={open} onOpenChange={handleFechar}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Importar preços da Tabela
            </DialogTitle>
            <DialogDescription>
              O Preço Final da planilha é gravado como <strong>Preço Final Proposto</strong> (origem
              Manual) — sem aplicar markup ou sobrepreço. Linhas novas também criam um BOM vazio do
              tipo produto final, pronto para receber a estrutura depois.
            </DialogDescription>
          </DialogHeader>

          {etapa === 'arquivo' && (
            <div className="flex flex-col gap-4 py-2">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files?.[0]
                  if (f && inputRef.current) {
                    const dt = new DataTransfer()
                    dt.items.add(f)
                    inputRef.current.files = dt.files
                    inputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
                  }
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleArquivo}
                />
                {isProcessing ? (
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                ) : (
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                )}
                <p className="mt-3 text-sm font-medium">
                  {isProcessing ? 'Lendo arquivo...' : 'Clique ou arraste o arquivo aqui'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Formatos aceitos: .xlsx e .csv — colunas: Código do Produto, Descrição, Unidade,
                  Categoria, Preço Final (R$), Fornecedor (opcional), Observação (opcional)
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1.5">
                <p className="font-medium text-foreground mb-1">
                  Regras de mesclagem (chave: código do produto):
                </p>
                <p>
                  <Badge variant="outline" className="mr-1.5">
                    Novo
                  </Badge>
                  cria produto final (preço direto) + BOM vazio sem componentes.
                </p>
                <p>
                  <Badge variant="outline" className="mr-1.5">
                    Existente sem BOM com componentes
                  </Badge>
                  atualiza o preço final e cria BOM vazio apenas se não existir.
                </p>
                <p>
                  <Badge variant="outline" className="mr-1.5">
                    Existente com BOM consolidado
                  </Badge>
                  atualiza apenas o preço final — a estrutura hierárquica não é alterada.
                </p>
              </div>

              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={baixarModeloImportacaoPrecos}
                  className="gap-2"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar modelo .xlsx de importação
                </Button>
              </div>
            </div>
          )}

          {etapa === 'preview' && preview && (
            <div className="flex flex-col gap-3 min-h-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {nomeArquivo}
                </Badge>
                <Badge className="gap-1 bg-blue-600 hover:bg-blue-600">
                  <PlusCircle className="h-3 w-3" />
                  {preview.novos.length} novo(s)
                </Badge>
                <Badge className="gap-1 bg-amber-600 hover:bg-amber-600">
                  <RefreshCw className="h-3 w-3" />
                  {preview.atualizacoes.length} atualização(ões)
                </Badge>
                {preview.problemas.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {preview.problemas.length} problema(s)
                  </Badge>
                )}
              </div>

              {preview.problemas.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-28 overflow-y-auto">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Linhas com problema (não serão importadas)
                  </p>
                  {preview.problemas.map((p: ProblemaLinha, i: number) => (
                    <p key={i} className="text-xs text-destructive/90">
                      Linha {p.linha} {p.codigo ? `(${p.codigo})` : ''}: {p.motivo}
                    </p>
                  ))}
                </div>
              )}

              <ScrollArea className="flex-1 min-h-0 rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Linha</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Preço Final</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>BOM vazio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.validas.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.linha.linha}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium">
                          {d.linha.codigo}
                        </TableCell>
                        <TableCell className="text-xs max-w-56 truncate">
                          {d.linha.descricao || '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium text-xs">
                          {formatBRL(d.linha.precoFinal)}
                        </TableCell>
                        <TableCell>
                          {d.acao === 'criar' ? (
                            <Badge className="bg-blue-600 hover:bg-blue-600 text-[10px]">
                              Criar produto
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-600 hover:bg-amber-600 text-[10px]">
                              {d.temBomComponentes
                                ? 'Atualizar preço'
                                : 'Atualizar preço + BOM vazio'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {d.criarBomVazio ? (
                            <span className="text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Sim
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Não (BOM consolidado)</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {etapa === 'importando' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">{msgProgresso || 'Gravando...'}</p>
              <Progress value={progresso} className="w-64" />
            </div>
          )}

          {etapa === 'resumo' && resultado && (
            <div className="flex flex-col items-center gap-4 py-6">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="text-base font-semibold">Importação concluída!</p>
              <div className="grid grid-cols-3 gap-3 w-full max-w-md">
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {resultado.produtosCriados}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Produtos criados</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {resultado.precosAtualizados}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Preços atualizados</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {resultado.bomsVaziosCriados}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">BOMs vazios criados</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center max-w-sm">
                Os preços importados (origem Manual) valem para novas propostas. Propostas já
                enviadas permanecem com os preços originais.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {etapa === 'preview' && (
              <>
                <Button variant="outline" onClick={reset} disabled={isProcessing}>
                  Escolher outro arquivo
                </Button>
                <Button
                  onClick={handleImportar}
                  disabled={isProcessing || preview.validas.length === 0}
                  className="gap-2"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Importar {preview.validas.length} linha(s)
                </Button>
              </>
            )}
            {etapa === 'arquivo' && (
              <Button variant="outline" onClick={() => handleFechar(false)}>
                Fechar
              </Button>
            )}
            {etapa === 'resumo' && <Button onClick={() => handleFechar(false)}>Concluir</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
