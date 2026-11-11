import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
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
  const q = useQuery({
    queryKey: ["eu"],
    queryFn: () => api<{ usuario: Usuario }>("/auth/eu").then((r) => r.usuario).catch(() => null),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const expirou = () => qc.setQueryData(["eu"], null);
    window.addEventListener("sessao-expirada", expirou);
    return () => window.removeEventListener("sessao-expirada", expirou);
  }, [qc]);

  const valor: Ctx = {
    usuario: q.data ?? null,
    carregando: q.isLoading,
    async entrar(email, senha) {
      const r = await api<{ usuario: Usuario }>("/auth/login", { method: "POST", body: { email, senha } });
      qc.clear();
      qc.setQueryData(["eu"], r.usuario);
    },
    async sair() {
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      qc.clear();
      qc.setQueryData(["eu"], null);
    },
  };
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
