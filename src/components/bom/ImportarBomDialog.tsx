import React, { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  UploadCloud,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Database,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import type { NoImportado, BomsInterpretados } from '@/utils/bomImportParser'
import { lerArquivoBom, interpretarBoms, baixarModeloImportacaoBom } from '@/utils/bomImportParser'
import { gravarImportacaoBom } from '@/services/bomImport'
import { formatBRL } from '@/utils/formatters'
import { labelTipoItem } from '@/types/erp'

const corTipo = (tipo?: string) => {
  switch (tipo) {
    case 'produto_final':
      return 'bg-primary/10 text-primary border-primary/30'
    case 'produto_semi_acabado':
      return 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30'
    case 'componente_interno':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function NoArvore({
  no,
  profundidade,
  expandidos,
  toggle,
}: {
  no: NoImportado
  profundidade: number
  expandidos: Set<string>
  toggle: (chave: string) => void
}) {
  const chave = `${no.linha.linha}`
  const aberto = expandidos.has(chave)
  const temFilhos = no.filhos.length > 0
  const fabricado = no.linha.tipo !== 'componente_terceiros'

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 border-b border-border/60 text-sm ${
          no.status === 'erro' ? 'bg-destructive/5' : ''
        } ${profundidade === 0 ? 'bg-primary/[0.04] font-medium' : ''}`}
        style={{ paddingLeft: `${12 + profundidade * 24}px` }}
      >
        <button
          type="button"
          onClick={() => temFilhos && toggle(chave)}
          className={`h-5 w-5 flex items-center justify-center rounded shrink-0 ${
            temFilhos ? 'text-muted-foreground hover:bg-muted' : 'opacity-0'
          }`}
          disabled={!temFilhos}
        >
          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="font-mono text-[10px] text-muted-foreground w-8 shrink-0">
          L{no.linha.linha}
        </span>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${corTipo(no.linha.tipo)}`}>
          {labelTipoItem(no.linha.tipo)}
        </Badge>
        <span className="font-mono text-xs font-semibold text-primary w-28 shrink-0 truncate">
          {no.linha.codigo || '—'}
        </span>
        <span className="flex-1 min-w-0 truncate text-foreground" title={no.linha.descricao}>
          {no.linha.descricao || '—'}
        </span>
        <span className="w-14 shrink-0 text-center font-mono text-xs">
          {no.linha.quantidade} {no.linha.unidade}
        </span>
        <span className="w-24 shrink-0 text-right font-mono text-xs">
          {fabricado ? (
            <span className="text-muted-foreground italic" title="Calculado por rolagem dos filhos">
              {formatBRL(no.custoRolado ?? 0)}
            </span>
          ) : (
            formatBRL(no.linha.custoUnitario)
          )}
        </span>
        {no.status === 'erro' ? (
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
        ) : no.avisos.length > 0 ? (
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        )}
      </div>

      {temFilhos && aberto && (
        <div>
          {no.filhos.map((f) => (
            <NoArvore
              key={`${f.linha.linha}-${f.linha.codigo}`}
              no={f}
              profundidade={profundidade + 1}
              expandidos={expandidos}
              toggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function coletarChavesExpandiveis(raizes: NoImportado[]): string[] {
  const chaves: string[] = []
  const walk = (no: NoImportado) => {
    if (no.filhos.length > 0) chaves.push(`${no.linha.linha}`)
    no.filhos.forEach(walk)
  }
  raizes.forEach(walk)
  return chaves
}

interface ImportarBomDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

export default function ImportarBomDialog({
  open,
  onOpenChange,
  onImported,
}: ImportarBomDialogProps) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [interpretado, setInterpretado] = useState<BomsInterpretados | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [resultado, setResultado] = useState<{
    bomsCriados: number
    itensCriados: number
    componentesReaproveitados: number
    componentesCriados: number
  } | null>(null)

  const temErros = (interpretado?.erros.length ?? 0) > 0
  const podeGravar = Boolean(interpretado) && !temErros && !isImporting

  const toggle = (chave: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave)
      else next.add(chave)
      return next
    })
  }

  const reset = () => {
    setFileName('')
    setInterpretado(null)
    setResultado(null)
    setExpandidos(new Set())
    setProgresso('')
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setIsProcessing(true)
    setResultado(null)
    try {
      const rows = await lerArquivoBom(file)
      if (rows.length === 0) {
        toast.error('O arquivo está vazio ou sem linhas de dados.')
        setInterpretado(null)
        return
      }
      const res = interpretarBoms(rows)
      setInterpretado(res)
      setExpandidos(new Set(coletarChavesExpandiveis(res.boms)))
      if (res.erros.length > 0) {
        toast.warning(`${res.erros.length} erro(s) bloqueante(s) encontrado(s) no arquivo.`)
      } else {
        toast.success(
          `${res.boms.length} BOM(s) interpretado(s) com ${res.totalLinhas} linhas — revise o preview antes de gravar.`,
        )
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro ao ler o arquivo. Verifique se é um .xlsx ou .csv válido.')
      setInterpretado(null)
    } finally {
      setIsProcessing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleGravar = async () => {
    if (!interpretado || temErros) return
    setIsImporting(true)
    setProgresso('Preparando gravação...')
    try {
      const res = await gravarImportacaoBom(interpretado.boms, setProgresso)
      setResultado(res)
      toast.success(`${res.bomsCriados} BOM(s) gravado(s) com ${res.itensCriados} item(ns).`)
      onImported()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Erro ao gravar a importação. Veja o console para detalhes.')
    } finally {
      setIsImporting(false)
      setProgresso('')
    }
  }

  const contagemErrosAvisos = useMemo(() => {
    if (!interpretado) return { erros: 0, avisos: 0 }
    return { erros: interpretado.erros.length, avisos: interpretado.avisos.length }
  }, [interpretado])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && reset()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar BOMs via Planilha
          </DialogTitle>
          <DialogDescription>
            Selecione um arquivo .xlsx ou .csv com as colunas Nível, Código do Componente,
            Descrição, Tipo, Categoria, Unidade, Quantidade, Custo Unitário e Fornecedor. Cada linha
            de Nível 0 inicia um novo BOM. Um preview e um relatório de validação serão exibidos
            antes de gravar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 min-h-0 flex flex-col">
          {/* Seleção de arquivo + modelo */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFile}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => fileRef.current?.click()}
              disabled={isProcessing || isImporting}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              {fileName ? 'Trocar arquivo' : 'Escolher arquivo'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="gap-2"
              onClick={() => {
                baixarModeloImportacaoBom()
                toast.success('Modelo .xlsx baixado com sucesso!')
              }}
              disabled={isImporting}
            >
              <Download className="h-4 w-4" />
              Baixar modelo .xlsx
            </Button>
            {fileName && (
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4" />
                {fileName}
              </span>
            )}
          </div>

          {/* Resultado da gravação */}
          {resultado && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm space-y-1">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Importação concluída
              </p>
              <p className="text-muted-foreground">
                {resultado.bomsCriados} BOM(s) criado(s) · {resultado.itensCriados} item(ns)
                gravado(s) · {resultado.componentesCriados} componente(s) novo(s) ·{' '}
                {resultado.componentesReaproveitados} reaproveitado(s) por código
              </p>
            </div>
          )}

          {/* Preview + validação */}
          {interpretado && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {interpretado.boms.length} BOM(s)
                </Badge>
                <Badge variant="outline" className="gap-1">
                  {interpretado.totalLinhas} linhas
                </Badge>
                <Badge
                  variant="outline"
                  className={`gap-1 ${
                    contagemErrosAvisos.erros > 0
                      ? 'border-destructive/40 text-destructive'
                      : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {contagemErrosAvisos.erros > 0 ? (
                    <XCircle className="h-3 w-3" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  {contagemErrosAvisos.erros} erro(s)
                </Badge>
                <Badge
                  variant="outline"
                  className={`gap-1 ${
                    contagemErrosAvisos.avisos > 0
                      ? 'border-amber-500/40 text-amber-700 dark:text-amber-400'
                      : ''
                  }`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {contagemErrosAvisos.avisos} aviso(s)
                </Badge>
              </div>

              {/* Árvore interpretada */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-primary" />
                  Preview da árvore interpretada
                </div>
                <ScrollArea className="max-h-64">
                  {interpretado.boms.length === 0 ? (
                    <p className="px-3 py-6 text-sm text-muted-foreground text-center">
                      Nenhuma linha de nível 0 encontrada — verifique a coluna Nível.
                    </p>
                  ) : (
                    <div>
                      {interpretado.boms.map((bom) => (
                        <NoArvore
                          key={bom.linha.linha}
                          no={bom}
                          profundidade={0}
                          expandidos={expandidos}
                          toggle={toggle}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Relatório de validação */}
              <div className="rounded-lg border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
                <div className="bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Relatório de validação
                </div>
                <ScrollArea className="max-h-44">
                  {interpretado.erros.length === 0 && interpretado.avisos.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Nenhum problema encontrado — pronto para gravar.
                    </p>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {interpretado.erros.map((e, i) => (
                        <div
                          key={`err-${i}`}
                          className="flex items-start gap-2 px-3 py-1.5 text-xs"
                        >
                          <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                          <span className="font-mono text-muted-foreground w-14 shrink-0">
                            Linha {e.linha}
                          </span>
                          <span className="font-mono text-primary w-28 shrink-0 truncate">
                            {e.codigo || '—'}
                          </span>
                          <span className="text-destructive">{e.motivo}</span>
                        </div>
                      ))}
                      {interpretado.avisos.map((a, i) => (
                        <div key={`av-${i}`} className="flex items-start gap-2 px-3 py-1.5 text-xs">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                          <span className="font-mono text-muted-foreground w-14 shrink-0">
                            Linha {a.linha}
                          </span>
                          <span className="font-mono text-primary w-28 shrink-0 truncate">
                            {a.codigo || '—'}
                          </span>
                          <span className="text-amber-700 dark:text-amber-400">{a.motivo}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
            disabled={isImporting}
          >
            {resultado ? 'Fechar' : 'Cancelar'}
          </Button>
          <Button type="button" onClick={handleGravar} disabled={!podeGravar}>
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gravando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Gravar importação
              </>
            )}
          </Button>
        </DialogFooter>

        {isImporting && progresso && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 -mt-2">
            <RefreshCw className="h-3 w-3 animate-spin" />
            {progresso}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
