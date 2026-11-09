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
              <Route path="/propostas" element={<PropostasPage />} />
              <Route path="/propostas/:id" element={<PropostaDetalhePage />} />

              {/* Rotas de engenharia e produção: bloqueadas para vendedor */}
              <Route element={<ProtectedRoute bloquearVendedor />}>
                <Route path="/" element={<IndexPage />} />
                <Route path="/componentes" element={<ComponentesPage />} />
                <Route path="/importar" element={<ImportarPage />} />
                <Route path="/boms" element={<BomsPage />} />
                <Route path="/boms/:id" element={<BomEditorPage />} />
                <Route path="/precificacao" element={<PrecificacaoPage />} />
                <Route path="/compras" element={<ComprasPage />} />
                <Route path="/compras/ordens" element={<ListaComprasPage />} />
              </Route>

              {/* Rotas restritas exclusivamente para administradores (já bloqueia vendedor) */}
              <Route element={<ProtectedRoute apenasAdmin />}>
                <Route path="/parametros" element={<ParametrosPage />} />
                <Route path="/usuarios" element={<UsuariosPage />} />
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
