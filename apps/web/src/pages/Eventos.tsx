import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api, qs, type Evento, type Pagina } from "../api";
import { Titulo } from "../components/Layout";
import { Cartao, Carregando, cx, Paginacao, Ponto, Selecao, Vazio } from "../components/ui";
import { dataHora } from "../lib/formato";

const COR_STATUS = {
  processado: "bg-good-soft text-good",
  duplicado: "bg-surface-2 text-ink-2",
  rejeitado: "bg-bad-soft text-bad",
};

/** Tudo que chegou pelo webhook, inclusive o que deu erro. Serve para acertar a integração com o bot. */
export function PaginaEventos() {
  const [status, setStatus] = useState("");
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<string | null>(null);
  const consulta = qs({ status, pagina, por_pagina: 30 });
  const q = useQuery({
    queryKey: ["eventos", consulta],
    queryFn: () => api<Pagina<Evento>>(`/eventos${consulta}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  return (
    <>
      <Titulo titulo="Eventos recebidos" descricao="Registro bruto de cada chamada do chatbot. Use para conferir se os dados estão chegando como esperado." />
      <div className="mb-3">
        <Selecao
          rotulo="Situação"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPagina(1);
          }}
          className="w-48"
        >
          <option value="">Todos</option>
          <option value="processado">Processados</option>
          <option value="rejeitado">Rejeitados</option>
          <option value="duplicado">Duplicados</option>
        </Selecao>
      </div>
      <Cartao>
        {!q.data ? (
          <Carregando />
        ) : !q.data.itens.length ? (
          <Vazio titulo="Nenhum evento recebido ainda">Gere o token em “Empresas e webhook” e configure o chatbot.</Vazio>
        ) : (
          <>
            <ul className="-mx-4 divide-y divide-line">
              {q.data.itens.map((e) => (
                <li key={e.id} className="px-4 py-2.5">
                  <button onClick={() => setAberto(aberto === e.id ? null : e.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left cursor-pointer">
                    <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", COR_STATUS[e.status])}>{e.status}</span>
                    <span className="flex items-center gap-1.5 text-sm">
                      <Ponto cor={e.empresaCor} className="size-2" />
                      {e.empresaNome ?? "—"}
                    </span>
                    <span className="text-xs text-muted tabular">{dataHora(e.recebidoEm)}</span>
                    {e.erro && <span className="text-xs text-bad">{e.erro}</span>}
                    {e.atendimentoId && (
                      <Link to={`/atendimentos/${e.atendimentoId}`} onClick={(ev) => ev.stopPropagation()} className="ml-auto text-xs text-accent-ink hover:underline">
                        Ver atendimento
                      </Link>
                    )}
                  </button>
                  {aberto === e.id && (
                    <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-[11px] leading-snug">{JSON.stringify(e.payload, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ul>
            <Paginacao pagina={q.data.pagina} porPagina={q.data.porPagina} total={q.data.total} onPagina={setPagina} />
          </>
        )}
      </Cartao>
    </>
  );
}
