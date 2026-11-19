import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { api, type Atendente, type Chatbot, type ItemCadastro, type StatusSistema, type Time } from "./api";
import { useAuth } from "./auth";
import { diasAtras, isoDia } from "./lib/formato";

/** Consultas de dados da empresa só rodam quando há empresa em uso */
function useDaEmpresa<T>(chave: string, caminho: string, staleTime = 30_000) {
  const { empresa } = useAuth();
  return useQuery({ queryKey: [chave, empresa?.id], queryFn: () => api<T>(caminho), staleTime, enabled: !!empresa });
}
export const useChatbots = () => useDaEmpresa<Chatbot[]>("chatbots", "/chatbots");
export const useAtendentes = () => useDaEmpresa<Atendente[]>("atendentes", "/atendentes");
export const useTimes = () => useDaEmpresa<Time[]>("times", "/times");
export const useOrigens = () => useDaEmpresa<ItemCadastro[]>("origens", "/origens");
export const useDepartamentos = () => useDaEmpresa<ItemCadastro[]>("departamentos", "/departamentos");
export const useEtiquetas = () => useDaEmpresa<ItemCadastro[]>("etiquetas", "/etiquetas");

export function useStatus() {
  const { empresa } = useAuth();
  return useQuery({ queryKey: ["status", empresa?.id], queryFn: () => api<StatusSistema>("/status"), refetchInterval: 10_000, enabled: !!empresa });
}

/**
 * Atualização automática: o status é consultado a cada 10 s (só com a aba visível).
 * Quando chega envio novo ou algum atendimento muda, as telas abertas buscam os dados de novo.
 */
export function useAtualizacaoAutomatica() {
  const qc = useQueryClient();
  const { data } = useStatus();
  const assinatura = data ? `${data.ultimoEvento?.recebidoEm ?? ""}|${data.ultimaAlteracao ?? ""}|${data.pendentes}` : null;
  const anterior = useRef<string | null>(null);
  useEffect(() => {
    if (!assinatura) return;
    if (anterior.current && anterior.current !== assinatura) {
      qc.invalidateQueries({ predicate: (q) => !["eu", "status"].includes(String(q.queryKey[0])) });
    }
    anterior.current = assinatura;
  }, [assinatura, qc]);
}

export const PERIODOS = [
  { id: "hoje", rotulo: "Hoje" },
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
    case "hoje":
      return { inicio: hoje, fim: hoje };
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

/** Nomes dos filtros na URL → nomes na API */
const FILTROS_URL = {
  chatbot: "chatbot_id",
  atendente: "atendente_id",
  time: "time_id",
  origem: "origem_id",
  departamento: "departamento_id",
  etiqueta: "etiqueta_id",
  canal: "canal",
  fonte: "fonte",
  cidade: "cidade",
  humano: "humano",
  novo: "novo",
  busca: "busca",
  situacao: "situacao",
  faixa_humano: "faixa_humano",
  faixa_resposta: "faixa_resposta",
  dia_semana: "dia_semana",
  hora: "hora",
  interesse: "interesse",
  ordem: "ordem",
} as const;

/** Parâmetros de "recorte" (vêm de um clique no painel); a lista mostra cada um como um chip removível */
export const RECORTES = ["situacao", "faixa_humano", "faixa_resposta", "dia_semana", "hora", "interesse", "anuncio", "novo", "canal", "fonte", "etiqueta"] as const;

/**
 * Link para a lista de atendimentos mantendo os filtros da tela atual (período, chatbot…) e somando o recorte.
 * Ex.: linkLista(params, { situacao: "esperou30", ordem: "espera" })
 */
export function linkLista(params: URLSearchParams, extra: Record<string, string | undefined>) {
  const p = new URLSearchParams(params);
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === "") p.delete(k);
    else p.set(k, v);
  }
  p.delete("pagina");
  return `/atendimentos?${p}`;
}

/** Filtros guardados na URL: dá para compartilhar o link com o filtro aplicado */
export function useFiltros() {
  const [sp, setSp] = useSearchParams();
  const periodo = sp.get("periodo") || "30d";
  const { inicio, fim } = intervaloDoPeriodo(periodo, sp.get("inicio"), sp.get("fim"));
  const filtros: Record<string, string | undefined> & { periodo: string; inicio?: string; fim?: string } = { periodo, inicio, fim };
  for (const [url, api_] of Object.entries(FILTROS_URL)) filtros[api_] = sp.get(url) || undefined;
  /** Só os parâmetros que a API entende */
  const consulta = Object.fromEntries(Object.entries(filtros).filter(([k]) => k !== "periodo"));
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
  return { filtros, consulta, definir, pagina, params: sp };
}
