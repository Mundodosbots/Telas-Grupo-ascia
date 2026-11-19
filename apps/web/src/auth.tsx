import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { api, definirEmpresaAtiva, empresaAtiva, type EmpresaResumo, type Perfil, type Usuario } from "./api";

type Ctx = {
  usuario: Usuario | null;
  carregando: boolean;
  /** Empresas que o usuário pode ver (superadmin: todas) */
  empresas: EmpresaResumo[];
  /** Empresa em uso (a do usuário, ou a escolhida pelo superadmin) */
  empresa: EmpresaResumo | null;
  trocarEmpresa: (id: string | null) => void;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  recarregarPerfil: () => void;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [escolhida, setEscolhida] = useState<string | null>(empresaAtiva());
  const q = useQuery({
    queryKey: ["eu"],
    queryFn: () => api<Perfil>("/auth/eu").catch(() => null),
    staleTime: 5 * 60_000,
  });

  /** Descarta os dados da sessão/empresa anterior (sem apagar a consulta ["eu"] que esta tela observa) */
  function limparDados() {
    qc.cancelQueries({ predicate: (c) => c.queryKey[0] !== "eu" });
    qc.removeQueries({ predicate: (c) => c.queryKey[0] !== "eu" });
  }
  function trocarSessao(perfil: Perfil | null) {
    limparDados();
    qc.setQueryData(["eu"], perfil);
  }

  useEffect(() => {
    const expirou = () => trocarSessao(null);
    window.addEventListener("sessao-expirada", expirou);
    return () => window.removeEventListener("sessao-expirada", expirou);
  });

  const perfil = q.data ?? null;
  const usuario = perfil?.usuario ?? null;
  const empresas = perfil?.empresas ?? [];
  const empresa =
    usuario?.papel === "superadmin" ? (empresas.find((e) => e.id === escolhida) ?? null) : (empresas.find((e) => e.id === usuario?.empresaId) ?? null);

  const valor: Ctx = {
    usuario,
    carregando: q.isLoading,
    empresas,
    empresa,
    trocarEmpresa(id) {
      definirEmpresaAtiva(id);
      setEscolhida(id);
      limparDados();
      navegar("/", { replace: true });
    },
    async entrar(email, senha) {
      const r = await api<Perfil>("/auth/login", { method: "POST", body: { email, senha } });
      // Superadmin com uma empresa só já entra nela
      if (r.usuario.papel === "superadmin" && !r.empresas.some((e) => e.id === empresaAtiva())) {
        const unica = r.empresas.length === 1 ? r.empresas[0]!.id : null;
        definirEmpresaAtiva(unica);
        setEscolhida(unica);
      }
      trocarSessao(r);
    },
    async sair() {
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      trocarSessao(null);
      navegar("/", { replace: true });
    },
    recarregarPerfil: () => void qc.invalidateQueries({ queryKey: ["eu"] }),
  };
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}

export const ehAdmin = (u: Usuario | null) => u?.papel === "admin" || u?.papel === "superadmin";
