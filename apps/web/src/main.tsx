import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider, ehAdmin, useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Carregando } from "./components/ui";
import "./index.css";
import { PaginaAtendentes } from "./pages/Atendentes";
import { PaginaAtendimento } from "./pages/Atendimento";
import { PaginaAtendimentos } from "./pages/Atendimentos";
import { PaginaCadastro } from "./pages/Cadastro";
import { PaginaEtiquetasPlataforma } from "./pages/EtiquetasPlataforma";
import { PaginaChatbots } from "./pages/Chatbots";
import { PaginaConta } from "./pages/Conta";
import { PaginaDashboard } from "./pages/Dashboard";
import { PaginaEmpresas } from "./pages/Empresas";
import { PaginaEventos } from "./pages/Eventos";
import { PaginaIntegracao } from "./pages/Integracao";
import { PaginaLogin } from "./pages/Login";
import { PaginaRegras } from "./pages/Regras";
import { PaginaRelatorios } from "./pages/Relatorios";
import { PaginaUsuarios } from "./pages/Usuarios";

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

function App() {
  const { usuario, carregando, empresa } = useAuth();
  if (carregando) return <Carregando />;
  if (!usuario) return <PaginaLogin />;
  const superadmin = usuario.papel === "superadmin";
  return (
    <Routes>
      <Route element={<Layout />}>
        {superadmin && <Route path="empresas" element={<PaginaEmpresas />} />}
        {/* Superadmin sem empresa escolhida: só a tela de empresas */}
        {!empresa ? (
          <>
            <Route path="conta" element={<PaginaConta />} />
            <Route path="*" element={superadmin ? <PaginaEmpresas /> : <Carregando />} />
          </>
        ) : (
          <>
            <Route index element={<PaginaDashboard />} />
            <Route path="atendentes" element={<PaginaAtendentes />} />
            <Route path="atendimentos" element={<PaginaAtendimentos />} />
            <Route path="atendimentos/:id" element={<PaginaAtendimento />} />
            <Route path="relatorios" element={<PaginaRelatorios />} />
            <Route path="chatbots" element={<PaginaChatbots />} />
            <Route path="como-configurar" element={<PaginaIntegracao />} />
            <Route path="departamentos" element={<PaginaCadastro tipo="departamentos" />} />
            <Route path="origens" element={<PaginaCadastro tipo="origens" />} />
            <Route path="etiquetas" element={<PaginaCadastro tipo="etiquetas" />} />
            <Route path="etiquetas-plataforma" element={<PaginaEtiquetasPlataforma />} />
            <Route path="regras" element={<PaginaRegras />} />
            <Route path="eventos" element={<PaginaEventos />} />
            <Route path="usuarios" element={ehAdmin(usuario) ? <PaginaUsuarios /> : <Navigate to="/" />} />
            <Route path="conta" element={<PaginaConta />} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        )}
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
