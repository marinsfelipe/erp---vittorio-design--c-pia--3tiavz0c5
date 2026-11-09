/**
 * Utilitário client-side para impressão e download de contratos formatados em PDF.
 * Usa a API nativa do navegador (window.open + window.print / styled print layout),
 * garantindo fidelidade de documento impresso (A4, cabeçalhos, tipografia profissional, quebra de página).
 */

export interface ContratoImpressaoData {
  numero: string
  cliente: string
  cnpj?: string
  conteudo: string
  dataGeracao?: string
}

export function imprimirContrato(dados: ContratoImpressaoData) {
  const win = window.open('', '_blank')
  if (!win) {
    alert('Por favor, permita pop-ups para visualizar e baixar o contrato em PDF.')
    return
  }

  // Escapa o texto mantendo as quebras de linha e parágrafos
  const textoFormatado = dados.conteudo
    .split('\n\n')
    .map((paragrafo) => `<p>${paragrafo.replace(/\n/g, '<br/>')}</p>`)
    .join('')

  const dataAtual = dados.dataGeracao || new Date().toLocaleDateString('pt-BR')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Contrato ${dados.numero} - ${dados.cliente}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 18mm 20mm 18mm;
    }
    @media print {
      body {
        margin: 0;
        background: #fff;
        color: #111;
      }
      .no-print {
        display: none !important;
      }
      .page-break {
        page-break-before: always;
      }
    }
    body {
      font-family: "Georgia", "Times New Roman", serif;
      font-size: 11.5pt;
      line-height: 1.6;
      color: #1a1a1a;
      background: #f8fafc;
      padding: 0;
      margin: 0;
    }
    .toolbar {
      position: sticky;
      top: 0;
      background: #0f172a;
      color: #fff;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 999;
    }
    .toolbar-title {
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toolbar button {
      background: #0284c7;
      border: none;
      color: #fff;
      padding: 8px 18px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .toolbar button:hover {
      background: #0369a1;
    }
    .document-container {
      max-width: 800px;
      margin: 32px auto;
      background: #fff;
      padding: 48px 56px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      border-radius: 4px;
    }
    @media print {
      .document-container {
        max-width: 100%;
        margin: 0;
        padding: 0;
        box-shadow: none;
        border-radius: 0;
      }
    }
    .doc-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .doc-brand {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #0f172a;
    }
    .doc-subbrand {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #64748b;
      font-weight: 600;
    }
    .doc-number-box {
      text-align: right;
    }
    .doc-number {
      font-size: 16px;
      font-weight: 700;
      color: #0284c7;
      font-family: monospace;
    }
    .doc-date {
      font-size: 11px;
      color: #64748b;
    }
    .doc-body {
      text-align: justify;
    }
    .doc-body p {
      margin: 0 0 14px 0;
      text-indent: 28px;
    }
    .doc-footer {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <div class="toolbar-title">
      <span>📄 Contrato Comercial — Vittorio Design (${dados.numero})</span>
    </div>
    <div style="display: flex; gap: 10px;">
      <button onclick="window.print()">
        🖨️ Imprimir / Salvar em PDF
      </button>
      <button onclick="window.close()" style="background: #475569;">
        ✕ Fechar
      </button>
    </div>
  </div>

  <div class="document-container">
    <div class="doc-header">
      <div>
        <div class="doc-brand">VITTORIO DESIGN</div>
        <div class="doc-subbrand">Sistemas de Refrigeração Comercial</div>
      </div>
      <div class="doc-number-box">
        <div class="doc-number">${dados.numero}</div>
        <div class="doc-date">Data: ${dataAtual}</div>
      </div>
    </div>

    <div class="doc-body">
      ${textoFormatado}
    </div>

    <div class="doc-footer">
      <span>Vittorio Design Refrigeração Comercial LTDA — CNPJ 12.345.678/0001-90</span>
      <span>Contrato Nº ${dados.numero}</span>
    </div>
  </div>

  <script>
    // Foca na janela e oferece a impressão caso o usuário deseje
    window.focus();
  </script>
</body>
</html>`

  win.document.open()
  win.document.write(html)
  win.document.close()
}
