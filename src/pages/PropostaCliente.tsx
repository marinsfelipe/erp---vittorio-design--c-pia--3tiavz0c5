import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Printer, ArrowLeft, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VittorioLogo } from '@/components/VittorioLogo'
import {
  propostasClienteService,
  type DocumentoCliente,
  type ItemDocumentoCliente,
} from '@/services/propostasCliente'
import { formatBRL, formatNumber } from '@/utils/formatters'
import { valorPorExtenso } from '@/utils/numeroExtenso'

/**
 * Documento da PROPOSTA PARA O CLIENTE — visualização limpa, fora do Layout.
 *
 * Contém somente o que interessa ao cliente. NUNCA exibe custo, custo
 * consolidado, margem, markup, overhead, preços de compra, NCM/CEST/impostos,
 * CFOP ou fornecedores — independentemente do perfil do usuário.
 * Impressão A4 via window.print() (@page size A4 no main.css).
 */
export default function PropostaClientePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [doc, setDoc] = useState<DocumentoCliente | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!id) return
    let cancelado = false
    setIsLoading(true)
    setErro('')
    propostasClienteService
      .getDocumento(id)
      .then((d) => {
        if (!cancelado) setDoc(d)
      })
      .catch((err: any) => {
        if (!cancelado) setErro(err?.message || 'Erro ao carregar o documento.')
      })
      .finally(() => {
        if (!cancelado) setIsLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [id])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-neutral-100 text-neutral-500 print:hidden">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando documento...
      </div>
    )
  }

  if (erro || !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-100 p-6 text-center print:hidden">
        <FileText className="h-10 w-10 text-neutral-300" />
        <p className="text-sm text-neutral-600">{erro || 'Documento não disponível.'}</p>
        <Button variant="outline" onClick={() => navigate('/propostas')}>
          Voltar para propostas
        </Button>
      </div>
    )
  }

  const dataEmissao = doc.proposta.data
    ? new Date(doc.proposta.data + 'T12:00:00').toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR')

  const descontoItens = doc.totais.total_desconto_itens
  const descontoGeral = doc.totais.total_desconto_geral
  const valorTotal = doc.totais.valor_total

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      {/* Barra de ações — nunca sai no papel (print:hidden) */}
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-2 print:hidden">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button size="sm" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir / Salvar PDF
        </Button>
      </div>

      {/* Folha A4 */}
      <div className="doc-folha" id="doc-proposta-cliente">
        {/* Cabeçalho — emissor */}
        <header className="doc-cabecalho">
          <div className="doc-emissor">
            <VittorioLogo size="md" className="h-12" />
            <div className="doc-emissor-dados">
              {doc.empresa.razao_social && <p className="doc-forte">{doc.empresa.razao_social}</p>}
              {doc.empresa.cnpj && <p>CNPJ: {doc.empresa.cnpj}</p>}
              {doc.empresa.endereco && <p>{doc.empresa.endereco}</p>}
              {(doc.empresa.cidade || doc.empresa.uf) && (
                <p>{[doc.empresa.cidade, doc.empresa.uf].filter(Boolean).join(' / ')}</p>
              )}
              {doc.empresa.telefone && <p>Tel.: {doc.empresa.telefone}</p>}
              {doc.empresa.email && <p>{doc.empresa.email}</p>}
            </div>
          </div>
          <div className="doc-titulo">
            <h1>PROPOSTA COMERCIAL</h1>
            <p className="doc-numero">Nº {doc.proposta.numero || '—'}</p>
            <p className="doc-data">Data: {dataEmissao}</p>
          </div>
        </header>

        {/* Cliente */}
        <section className="doc-bloco">
          <h2>Cliente</h2>
          <p className="doc-forte">{doc.cliente?.razao_social || doc.cliente_fallback}</p>
          {doc.cliente?.cnpj && <p>CNPJ: {doc.cliente.cnpj}</p>}
          {doc.cliente?.contato && <p>A/C: {doc.cliente.contato}</p>}
          {(doc.cliente?.endereco || doc.cliente?.cidade) && (
            <p>
              {[doc.cliente.endereco, doc.cliente.cidade].filter(Boolean).join(' — ')}
              {doc.cliente.uf ? ` / ${doc.cliente.uf}` : ''}
            </p>
          )}
        </section>

        {/* Itens */}
        <table className="doc-tabela">
          <thead>
            <tr>
              <th className="doc-col-cod">Código</th>
              <th>Descrição</th>
              <th className="doc-col-num">Qtd.</th>
              <th className="doc-col-num">Valor unitário</th>
              <th className="doc-col-num">Desconto</th>
              <th className="doc-col-num">Total</th>
            </tr>
          </thead>
          <tbody>
            {doc.itens.map((it: ItemDocumentoCliente) => {
              const temDesconto = (it.desconto_valor || 0) > 0
              return (
                <tr key={it.sku + it.nome_produto}>
                  <td className="doc-mono">{it.sku}</td>
                  <td>
                    {it.nome_produto}
                    {it.unidade && it.unidade !== 'UN' ? ` (${it.unidade})` : ''}
                  </td>
                  <td className="doc-col-num doc-mono">{formatNumber(it.quantidade)}</td>
                  <td className="doc-col-num doc-mono">{formatBRL(it.preco_unitario)}</td>
                  <td className="doc-col-num doc-mono">
                    {temDesconto
                      ? it.desconto_tipo === 'percentual'
                        ? `-${it.desconto_valor}%`
                        : `-${formatBRL(it.desconto_valor || 0)}`
                      : '—'}
                  </td>
                  <td className="doc-col-num doc-mono">{formatBRL(it.total)}</td>
                </tr>
              )
            })}
            {doc.itens.length === 0 && (
              <tr>
                <td colSpan={6} className="doc-vazio">
                  Nenhum item na proposta.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totais */}
        <section className="doc-totais">
          <div className="doc-linha-total">
            <span>Subtotal</span>
            <span className="doc-mono">{formatBRL(doc.totais.subtotal)}</span>
          </div>
          {descontoItens > 0 && (
            <div className="doc-linha-total">
              <span>Desconto dos itens</span>
              <span className="doc-mono">-{formatBRL(descontoItens)}</span>
            </div>
          )}
          {descontoGeral > 0 && (
            <div className="doc-linha-total">
              <span>Desconto geral</span>
              <span className="doc-mono">-{formatBRL(descontoGeral)}</span>
            </div>
          )}
          <div className="doc-linha-total doc-total-final">
            <span>VALOR TOTAL</span>
            <span className="doc-mono">{formatBRL(valorTotal)}</span>
          </div>
          <p className="doc-extenso">({valorPorExtenso(valorTotal)})</p>
        </section>

        {/* Condições comerciais */}
        {(doc.condicao_pagamento ||
          doc.prazo_entrega ||
          doc.garantia ||
          doc.proposta.observacoes) && (
          <section className="doc-bloco">
            <h2>Condições comerciais</h2>
            {doc.condicao_pagamento && (
              <p>
                <strong>Condição de pagamento:</strong> {doc.condicao_pagamento}
              </p>
            )}
            {doc.prazo_entrega && (
              <p>
                <strong>Prazo de entrega:</strong> {doc.prazo_entrega}
              </p>
            )}
            {doc.garantia && (
              <p>
                <strong>Garantia:</strong> {doc.garantia}
              </p>
            )}
            {doc.proposta.observacoes && (
              <p>
                <strong>Observações:</strong> {doc.proposta.observacoes}
              </p>
            )}
          </section>
        )}

        {/* Rodapé + assinaturas */}
        <footer className="doc-rodape">
          <p className="doc-nota">
            Valores válidos conforme a validade desta proposta. Após o prazo, sujeito a
            reconfirmação pela Vittorio Design.
          </p>
          <div className="doc-assinaturas">
            <div className="doc-assinatura">
              <div className="doc-linha-assinatura" />
              <p>{doc.empresa.razao_social || 'Vittorio Design'}</p>
            </div>
            <div className="doc-assinatura">
              <div className="doc-linha-assinatura" />
              <p>{doc.cliente?.razao_social || doc.cliente_fallback}</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
