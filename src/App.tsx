import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import { AuthProvider } from '@/context/AuthContext'
import IndexPage from '@/pages/Index'
import ComponentesPage from '@/pages/Componentes'
import ImportarPage from '@/pages/Importar'
import ParametrosPage from '@/pages/Parametros'
import BomsPage from '@/pages/Boms'
import BomEditorPage from '@/pages/BomEditor'
import PrecificacaoPage from '@/pages/Precificacao'
import PropostasPage from '@/pages/Propostas'
import PropostaDetalhePage from '@/pages/PropostaDetalhe'
import ComprasPage from '@/pages/Compras'
import ListaComprasPage from '@/pages/ListaCompras'
import LoginPage from '@/pages/Login'
import UsuariosPage from '@/pages/Usuarios'
import ClientesPage from '@/pages/Clientes'
import CatalogoPage from '@/pages/Catalogo'
import PipelinePage from '@/pages/Pipeline'
import ModelosContratoPage from '@/pages/ModelosContrato'
import ContratosPage from '@/pages/Contratos'
import FaturamentosPage from '@/pages/Faturamentos'
import ContasReceberPage from '@/pages/ContasReceber'
import ContasPagarPage from '@/pages/ContasPagar'
import DashboardFinanceiroPage from '@/pages/DashboardFinanceiro'
import FluxoCaixaPage from '@/pages/FluxoCaixa'
import ComissoesPage from '@/pages/Comissoes'
import DRESimplificadoPage from '@/pages/DRESimplificado'
import TabelaPrecosPage from '@/pages/TabelaPrecos'
import FiscalPage from '@/pages/Fiscal'
import EmpresaPage from '@/pages/Empresa'
import NotFound from '@/pages/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Todas as páginas internas exigem autenticação e status aprovado */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              {/* Rotas comerciais acessíveis para vendedor, usuário e admin */}
              <Route path="/catalogo" element={<CatalogoPage />} />
              <Route path="/clientes" element={<ClientesPage />} />
              <Route path="/pipeline" element={<PipelinePage />} />
              <Route path="/propostas" element={<PropostasPage />} />
              <Route path="/propostas/:id" element={<PropostaDetalhePage />} />
              <Route path="/contratos" element={<ContratosPage />} />
              <Route path="/faturamentos" element={<FaturamentosPage />} />
              <Route path="/minhas-comissoes" element={<ComissoesPage />} />

              {/* Rotas de engenharia e produção: bloqueadas para vendedor */}
              <Route element={<ProtectedRoute bloquearVendedor />}>
                <Route path="/" element={<IndexPage />} />
                <Route path="/componentes" element={<ComponentesPage />} />
                <Route path="/importar" element={<ImportarPage />} />
                <Route path="/boms" element={<BomsPage />} />
                <Route path="/boms/:id" element={<BomEditorPage />} />
                <Route path="/precificacao" element={<PrecificacaoPage />} />
                {/* Com BOM pré-selecionado — links de BOMs e do editor de BOM */}
                <Route path="/precificacao/:id" element={<PrecificacaoPage />} />
                <Route path="/compras" element={<ComprasPage />} />
                <Route path="/compras/ordens" element={<ListaComprasPage />} />
              </Route>

              {/* Rotas restritas exclusivamente para administradores (já bloqueia vendedor) */}
              <Route element={<ProtectedRoute apenasAdmin />}>
                <Route path="/financeiro" element={<DashboardFinanceiroPage />} />
                <Route path="/fluxo-caixa" element={<FluxoCaixaPage />} />
                <Route path="/contas-receber" element={<ContasReceberPage />} />
                <Route path="/contas-pagar" element={<ContasPagarPage />} />
                <Route path="/comissoes" element={<ComissoesPage />} />
                <Route path="/dre" element={<DRESimplificadoPage />} />
                <Route path="/tabela-precos" element={<TabelaPrecosPage />} />
                <Route path="/parametros" element={<ParametrosPage />} />
                <Route path="/usuarios" element={<UsuariosPage />} />
                <Route path="/modelos-contrato" element={<ModelosContratoPage />} />
                {/* Módulo Fiscal — exclusivo admin */}
                <Route path="/fiscal" element={<FiscalPage />} />
                <Route path="/empresa" element={<EmpresaPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  )
}
