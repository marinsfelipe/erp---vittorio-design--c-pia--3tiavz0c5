/* Main App Component - Handles routing (using react-router-dom), query client and other providers */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Index from './pages/Index'
import NotFound from './pages/NotFound'
import Login from './pages/Login'
import ComponentesPage from './pages/Componentes'
import ImportarPage from './pages/Importar'
import BomsPage from './pages/Boms'
import BomEditorPage from './pages/BomEditor'
import PrecificacaoPage from './pages/Precificacao'
import ParametrosPage from './pages/Parametros'
import ListaComprasPage from './pages/ListaCompras'
import PropostasPage from './pages/Propostas'
import PropostaDetalhePage from './pages/PropostaDetalhe'
import ComprasPage from './pages/Compras'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner richColors position="top-right" />
        <Routes>
          {/* Rota pública de autenticação */}
          <Route path="/login" element={<Login />} />

          {/* Rotas protegidas dentro do Layout ERP */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/componentes" element={<ComponentesPage />} />
              <Route path="/importar" element={<ImportarPage />} />
              <Route path="/boms" element={<BomsPage />} />
              <Route path="/boms/:id" element={<BomEditorPage />} />
              <Route path="/precificacao" element={<PrecificacaoPage />} />
              <Route path="/precificacao/:id" element={<PrecificacaoPage />} />
              <Route path="/parametros" element={<ParametrosPage />} />
              <Route path="/compras" element={<ListaComprasPage />} />
              <Route path="/propostas" element={<PropostasPage />} />
              <Route path="/propostas/:id" element={<PropostaDetalhePage />} />
              <Route path="/pedidos-compra" element={<ComprasPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
