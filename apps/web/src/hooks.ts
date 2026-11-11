import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api, type Empresa, type ItemCadastro, type StatusSistema, type Vendedor } from "./api";
import { diasAtras, isoDia } from "./lib/formato";

export const useEmpresas = () => useQuery({ queryKey: ["empresas"], queryFn: () => api<Empresa[]>("/empresas"), staleTime: 60_000 });
export const useVendedores = () => useQuery({ queryKey: ["vendedores"], queryFn: () => api<Vendedor[]>("/vendedores"), staleTime: 30_000 });
export const useOrigens = () => useQuery({ queryKey: ["origens"], queryFn: () => api<ItemCadastro[]>("/origens"), staleTime: 30_000 });
export const useEtiquetas = () => useQuery({ queryKey: ["etiquetas"], queryFn: () => api<ItemCadastro[]>("/etiquetas"), staleTime: 30_000 });
export const useStatus = () =>
  useQuery({ queryKey: ["status"], queryFn: () => api<StatusSistema>("/status"), refetchInterval: 30_000 });

export const PERIODOS = [
  { id: "7d", rotulo: "Últimos 7 dias" },
  { id: "30d", rotulo: "Últimos 30 dias" },
  { id: "90d", rotulo: "Últimos 90 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "tudo", rotulo: "Tudo" },
  { id: "custom", rotulo: "Personalizado" },
] as const;

function intervaloDoPeriodo(periodo: string, inicio?: string | null, fim?: string | null) {
  const hoje = isoDia(new Date());
  switch (periodo) {
    case "7d":
      return { inicio: diasAtras(6), fim: hoje };
    case "90d":
      return { inicio: diasAtras(89), fim: hoje };
    case "mes":
      return { inicio: hoje.slice(0, 8) + "01", fim: hoje };
    case "tudo":
      return { inicio: undefined, fim: undefined };
    case "custom":
      return { inicio: inicio || diasAtras(29), fim: fim || hoje };
    default:
      return { inicio: diasAtras(29), fim: hoje };
  }
}

/** Filtros guardados na URL: dá para compartilhar o link com o filtro aplicado */
export function useFiltros() {
  const [sp, setSp] = useSearchParams();
  const periodo = sp.get("periodo") || "30d";
  const { inicio, fim } = intervaloDoPeriodo(periodo, sp.get("inicio"), sp.get("fim"));
  const filtros = {
    periodo,
    inicio,
    fim,
    empresa_id: sp.get("empresa") || undefined,
    vendedor_id: sp.get("vendedor") || undefined,
    origem_id: sp.get("origem") || undefined,
    etiqueta_id: sp.get("etiqueta") || undefined,
    status: sp.get("status") || undefined,
    busca: sp.get("busca") || undefined,
  };
  function definir(mudancas: Record<string, string | undefined>) {
    const novo = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) novo.set(k, v);
      else novo.delete(k);
    }
    if (!("pagina" in mudancas)) novo.delete("pagina");
    setSp(novo, { replace: true });
  }
  const pagina = Number(sp.get("pagina")) || 1;
  return { filtros, definir, pagina, params: sp };
}
