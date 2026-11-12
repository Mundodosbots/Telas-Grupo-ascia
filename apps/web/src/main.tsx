import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Carregando } from "./components/ui";
import "./index.css";
import { PaginaAtendimento } from "./pages/Atendimento";
import { PaginaAtendimentos } from "./pages/Atendimentos";
import { PaginaCadastro } from "./pages/Cadastro";
import { PaginaConta } from "./pages/Conta";
import { PaginaDashboard } from "./pages/Dashboard";
import { PaginaEmpresas } from "./pages/Empresas";
import { PaginaEventos } from "./pages/Eventos";
import { PaginaLogin } from "./pages/Login";
import { PaginaRegras } from "./pages/Regras";
import { PaginaRelatorios } from "./pages/Relatorios";
import { PaginaRevisar } from "./pages/Revisar";
import { PaginaUsuarios } from "./pages/Usuarios";
import { PaginaVendedores } from "./pages/Vendedores";

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

function App() {
  const { usuario, carregando } = useAuth();
  if (carregando) return <Carregando />;
  if (!usuario) return <PaginaLogin />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PaginaDashboard />} />
        <Route path="atendimentos" element={<PaginaAtendimentos />} />
        <Route path="atendimentos/:id" element={<PaginaAtendimento />} />
        <Route path="revisar" element={<PaginaRevisar />} />
        <Route path="relatorios" element={<PaginaRelatorios />} />
        <Route path="vendedores" element={<PaginaVendedores />} />
        <Route path="origens" element={<PaginaCadastro tipo="origens" />} />
        <Route path="etiquetas" element={<PaginaCadastro tipo="etiquetas" />} />
        <Route path="regras" element={<PaginaRegras />} />
        <Route path="empresas" element={<PaginaEmpresas />} />
        <Route path="eventos" element={<PaginaEventos />} />
        <Route path="usuarios" element={usuario.papel === "master" ? <PaginaUsuarios /> : <Navigate to="/" />} />
        <Route path="conta" element={<PaginaConta />} />
        <Route path="*" element={<Navigate to="/" />} />
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
