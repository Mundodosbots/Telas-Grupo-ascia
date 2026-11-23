import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Copy, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api, qs, type Evento, type Pagina } from "../api";
import { useAuth } from "../auth";
import { Titulo } from "../components/Layout";
import { Botao, Cartao, Carregando, cx, Paginacao, Ponto, Selecao, Vazio } from "../components/ui";
import { useChatbots } from "../hooks";
import { dataHora, numero } from "../lib/formato";

const STATUS: Record<Evento["status"], { rotulo: string; classe: string }> = {
  processado: { rotulo: "processado", classe: "bg-good-soft text-good" },
  rejeitado: { rotulo: "recusado", classe: "bg-bad-soft text-bad" },
  capturado: { rotulo: "captura de teste", classe: "bg-accent-soft text-accent-ink" },
};

/** Tudo o que chegou pelo webhook, inclusive o que deu erro — para acertar a integração */
export function PaginaEventos() {
  const { empresa } = useAuth();
  const chatbots = useChatbots();
  const [status, setStatus] = useState("");
  const [chatbot, setChatbot] = useState("");
  const [pagina, setPagina] = useState(1);
  const [copiado, setCopiado] = useState<string | null>(null);
  const consulta = qs({ status, chatbot_id: chatbot, pagina, por_pagina: 30 });
  const q = useQuery({
    queryKey: ["eventos", empresa?.id, consulta],
    queryFn: () => api<Pagina<Evento>>(`/eventos${consulta}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
    enabled: !!empresa,
  });
  async function copiarJson(id: string) {
    const json = await api<unknown>(`/eventos/${id}`);
    await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  }

  return (
    <>
      <Titulo titulo="Envios recebidos" descricao="Cada envio da plataforma (fim do atendimento), com o que ele gerou. Os recusados mostram o motivo." />
      <div className="mb-4 flex flex-wrap gap-3">
        <Selecao rotulo="Situação" value={status} onChange={(e) => (setStatus(e.target.value), setPagina(1))} className="w-48">
          <option value="">Todos</option>
          <option value="processado">Processados</option>
          <option value="rejeitado">Recusados</option>
          <option value="capturado">Capturas de teste</option>
        </Selecao>
        <Selecao rotulo="Chatbot" value={chatbot} onChange={(e) => (setChatbot(e.target.value), setPagina(1))} className="w-52">
          <option value="">Todos</option>
          {(chatbots.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Selecao>
      </div>
      <Cartao>
        {!q.data ? (
          <Carregando />
        ) : !q.data.itens.length ? (
          <Vazio titulo="Nenhum envio ainda">Configure o link do chatbot no fluxo da plataforma e use "Testar Agora".</Vazio>
        ) : (
          <>
            <ul className="-mx-4 divide-y divide-line">
              {q.data.itens.map((e) => {
                const r = e.resultado as (Record<string, number | string | null> & { avisos?: string[] }) | null;
                const avisos = Array.isArray(r?.avisos) ? r!.avisos : [];
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", STATUS[e.status].classe)}>{STATUS[e.status].rotulo}</span>
                    <span className="tabular text-ink-2">{dataHora(e.recebidoEm)}</span>
                    {e.chatbotNome && (
                      <span className="inline-flex items-center gap-1 text-ink-2">
                        <Ponto cor={e.chatbotCor} /> {e.chatbotNome}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {e.contatoNome && e.contatoId ? (
                        <Link to={`/atendimentos?busca=${encodeURIComponent(e.contatoNome)}&periodo=tudo`} className="font-medium hover:underline">
                          {e.contatoNome}
                        </Link>
                      ) : null}
                      {r && (
                        <span className="ml-2 text-xs text-muted">
                          {numero(Number(r.atendimentos_novos ?? 0))} novo(s), {numero(Number(r.atendimentos_atualizados ?? 0))} atualizado(s), {numero(Number(r.mensagens_novas ?? 0))} msg nova(s)
                        </span>
                      )}
                      {e.erro && <span className="ml-2 text-xs text-bad">{e.erro}</span>}
                    </span>
                    <span className="text-xs text-muted tabular">{numero(Math.round(e.tamanhoBytes / 1024))} KB</span>
                    <Botao variante="fantasma" onClick={() => copiarJson(e.id)}>
                      <Copy className="size-4" /> {copiado === e.id ? "Copiado!" : "Copiar JSON"}
                    </Botao>
                    {avisos.length > 0 && (
                      <ul className="grid w-full gap-1 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                        {avisos.map((a) => (
                          <li key={a} className="flex gap-1.5">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {a}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <Paginacao pagina={pagina} total={q.data.total} porPagina={30} onPagina={setPagina} />
          </>
        )}
      </Cartao>
    </>
  );
}
