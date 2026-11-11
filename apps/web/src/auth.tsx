import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { api, type Usuario } from "./api";

type Ctx = {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const q = useQuery({
    queryKey: ["eu"],
    queryFn: () => api<{ usuario: Usuario }>("/auth/eu").then((r) => r.usuario).catch(() => null),
    staleTime: 5 * 60_000,
  });

  /**
   * Troca o usuário da sessão e descarta os dados da sessão anterior.
   * Não usar qc.clear(): ele apaga também a consulta ["eu"] que esta tela observa,
   * e aí a troca de usuário não chega na tela (login/sair "travavam" até recarregar).
   */
  function trocarSessao(usuario: Usuario | null) {
    qc.cancelQueries({ predicate: (c) => c.queryKey[0] !== "eu" });
    qc.removeQueries({ predicate: (c) => c.queryKey[0] !== "eu" });
    qc.setQueryData(["eu"], usuario);
  }

  useEffect(() => {
    const expirou = () => trocarSessao(null);
    window.addEventListener("sessao-expirada", expirou);
    return () => window.removeEventListener("sessao-expirada", expirou);
  });

  const valor: Ctx = {
    usuario: q.data ?? null,
    carregando: q.isLoading,
    async entrar(email, senha) {
      const r = await api<{ usuario: Usuario }>("/auth/login", { method: "POST", body: { email, senha } });
      trocarSessao(r.usuario);
    },
    async sair() {
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      trocarSessao(null);
      navegar("/", { replace: true });
    },
  };
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
