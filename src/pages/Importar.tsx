import React, { useState } from 'react'
import { componentesService } from '@/services/componentes'
import { parseCsvOrTsv, mapRowToComponente } from '@/utils/csvParser'
import { formatBRL } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Download,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link, useNavigate } from 'react-router-dom'

interface PreviewItem {
  codigo: string
  descricao: string
  categoria: string
  unidade: string
  custo_unitario: number
  fornecedor: string
  status: 'valido' | 'invalido'
  motivo?: string
}

export default function ImportarPage() {
  const navigate = useNavigate()
  const [fileName, setFileName] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
  const [importSummary, setImportSummary] = useState<{
    created: number
    updated: number
    errors: number
  } | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setIsProcessing(true)
    setImportSummary(null)

    try {
      const text = await file.text()
      const { rows } = parseCsvOrTsv(text)

      if (rows.length === 0) {
        toast.error('O arquivo está vazio ou em formato inválido.')
        setPreviewItems([])
        return
      }

      const parsed: PreviewItem[] = rows.map((r) => {
        const mapped = mapRowToComponente(r)
        if (!mapped) {
          return {
            codigo: r['codigo'] || r['cod'] || '—',
            descricao: r['descricao'] || 'Falta código ou descrição',
            categoria: '—',
            unidade: 'UN',
            custo_unitario: 0,
            fornecedor: '—',
            status: 'invalido',
            motivo: 'Código ou descrição ausentes',
          }
        }
        return {
          ...mapped,
          status: 'valido',
        }
      })

      setPreviewItems(parsed)
      toast.success(`${parsed.length} linhas lidas do arquivo!`)
    } catch (err: any) {
      console.error(err)
      toast.error(
        'Erro ao ler arquivo. Certifique-se de que é um CSV ou arquivo de texto separado por vírgula/ponto-e-vírgula.',
      )
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDownloadTemplate = () => {
    const csvContent =
      'codigo;descricao;categoria;unidade;custo_unitario;fornecedor\n' +
      'CMP-0199;Compressor Hermético Inverter 1/3HP;Refrigeração;UN;750,00;Embraco Brasil\n' +
      'EVAP-0299;Evaporador Roll-Bond Alumínio 900mm;Evaporação;UN;185,50;Frigoking Componentes\n' +
      'CH-0599;Chapa Inox 304 Escovada 1.0mm;Estrutura & Funilaria;M2;145,00;Aperam South America\n' +
      'TER-0499;Sensor de Temperatura NTC 10K Cabo 2m;Elétrica & Controle;UN;18,00;Full Gauge Controls\n'

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'modelo_componentes_refrigeracao.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Modelo CSV baixado com sucesso!')
  }

  const handleConfirmImport = async () => {
    const validItems = previewItems
      .filter((p) => p.status === 'valido')
      .map(({ codigo, descricao, categoria, unidade, custo_unitario, fornecedor }) => ({
        codigo,
        descricao,
        categoria,
        unidade,
        custo_unitario,
        fornecedor,
      }))

    if (validItems.length === 0) {
      toast.error('Nenhum componente válido para importar.')
      return
    }

    setIsImporting(true)
    try {
      const result = await componentesService.importBatch(validItems)
      setImportSummary(result)
      toast.success(
        `Importação concluída! ${result.created} criados, ${result.updated} atualizados.`,
      )
    } catch (err: any) {
      console.error(err)
      toast.error('Erro durante a importação em lote.')
    } finally {
      setIsImporting(false)
    }
  }

  const validCount = previewItems.filter((i) => i.status === 'valido').length
  const invalidCount = previewItems.filter((i) => i.status === 'invalido').length

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Importar Planilha de Componentes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Envie sua planilha de componentes (CSV ou export de Excel) para carregar o catálogo de
            peças
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-2">
            <Download className="h-4 w-4" />
            Baixar Modelo CSV
          </Button>
          <Link to="/componentes">
            <Button variant="ghost" size="sm">
              Ver Componentes
            </Button>
          </Link>
        </div>
      </div>

      {/* Área de Upload e Orientações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-dashed border-2 hover:border-primary/50 transition-colors">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center text-primary mb-2">
                <UploadCloud className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Selecione ou arraste seu arquivo</CardTitle>
              <CardDescription>
                Compatível com arquivos CSV, TSV e relatórios de planilhas de estoque/engenharia
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pb-6">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".csv,.txt,.tsv"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isProcessing || isImporting}
                />
                <Button
                  variant="secondary"
                  className="pointer-events-none"
                  disabled={isProcessing || isImporting}
                >
                  {fileName ? 'Trocar Arquivo' : 'Escolher Arquivo do Computador'}
                </Button>
              </label>
              {fileName && (
                <p className="text-xs font-mono text-muted-foreground mt-2">
                  Arquivo selecionado: <strong className="text-foreground">{fileName}</strong>
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna de Instruções */}
        <Card className="bg-muted/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-primary font-medium text-sm">
              <FileText className="h-4 w-4" />
              Colunas Aceitas na Planilha
            </div>
          </CardHeader>
          <CardContent className="text-xs space-y-2 text-muted-foreground">
            <p>A primeira linha deve conter os cabeçalhos. Nomes reconhecidos automaticamente:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-foreground">codigo</strong> (ou cod, part number)
              </li>
              <li>
                <strong className="text-foreground">descricao</strong> (ou desc, item, nome)
              </li>
              <li>
                <strong className="text-foreground">categoria</strong> (ou grupo)
              </li>
              <li>
                <strong className="text-foreground">unidade</strong> (UN, KG, M, M2...)
              </li>
              <li>
                <strong className="text-foreground">custo_unitario</strong> (ou custo, valor, preco)
              </li>
              <li>
                <strong className="text-foreground">fornecedor</strong> (ou fabricante, supplier)
              </li>
            </ul>
            <p className="pt-2 text-xs text-foreground/80">
              * Itens com código existente serão atualizados, mantendo o catálogo sempre
              sincronizado.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Resumo pós-importação se concluído */}
      {importSummary && (
        <Card className="bg-emerald-500/10 border-emerald-500/30">
          <CardContent className="py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <div>
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Importação realizada com sucesso!
                </p>
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  {importSummary.created} novos componentes cadastrados | {importSummary.updated}{' '}
                  componentes atualizados{' '}
                  {importSummary.errors > 0 ? `| ${importSummary.errors} com falha` : ''}
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate('/componentes')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              Ir para Componentes
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabela de Pré-visualização e Conferência */}
      {previewItems.length > 0 && !importSummary && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card p-4 rounded-xl border border-border">
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40"
              >
                {validCount} Válidos
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {invalidCount} Inválidos
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Revise os dados abaixo antes de confirmar o envio ao banco.
              </span>
            </div>

            <Button
              onClick={handleConfirmImport}
              disabled={isImporting || validCount === 0}
              className="gap-2 bg-primary"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isImporting ? 'Gravando no banco...' : `Confirmar Importação (${validCount} itens)`}
            </Button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-32 font-semibold">Código</TableHead>
                  <TableHead className="font-semibold">Descrição</TableHead>
                  <TableHead className="w-36 font-semibold">Categoria</TableHead>
                  <TableHead className="w-20 font-semibold text-center">Unid.</TableHead>
                  <TableHead className="w-32 font-semibold text-right">Custo</TableHead>
                  <TableHead className="w-44 font-semibold">Fornecedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewItems.slice(0, 100).map((item, idx) => (
                  <TableRow
                    key={idx}
                    className={item.status === 'invalido' ? 'bg-destructive/10' : ''}
                  >
                    <TableCell>
                      {item.status === 'valido' ? (
                        <Badge
                          variant="secondary"
                          className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        >
                          OK
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Erro
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono font-semibold">{item.codigo}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.descricao}</div>
                      {item.motivo && (
                        <span className="text-xs text-destructive">{item.motivo}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{item.categoria}</TableCell>
                    <TableCell className="text-center font-mono text-xs">{item.unidade}</TableCell>
                    <TableCell className="text-right font-mono font-medium text-emerald-700 dark:text-emerald-400">
                      {formatBRL(item.custo_unitario)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate">
                      {item.fornecedor}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {previewItems.length > 100 && (
              <div className="p-3 text-center text-xs text-muted-foreground bg-muted/20 border-t border-border">
                Mostrando os primeiros 100 de {previewItems.length} itens encontrados na planilha.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
