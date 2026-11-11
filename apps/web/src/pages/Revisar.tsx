import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Link } from "react-router";
import { api, qs, type AtendimentoItem, type Pagina } from "../api";
import { EditorClassificacao } from "../components/EditorClassificacao";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, Cartao, Carregando, Ponto, StatusBadge, Vazio } from "../components/ui";
import { useStatus } from "../hooks";
import { dataHora, telefone, trechoParaRevisao } from "../lib/formato";

/** Fila de trabalho: o que a IA não conseguiu decidir sozinha */
export function PaginaRevisar() {
  const qc = useQueryClient();
  const status = useStatus();
  const semIa = status.data && !status.data.agenteAtivo;
  const filtroStatus = semIa ? "revisar,erro,pendente" : "revisar,erro";
  const q = useQuery({
    queryKey: ["atendimentos", "revisar", filtroStatus],
    queryFn: () => api<Pagina<AtendimentoItem>>(`/atendimentos${qs({ status: filtroStatus, por_pagina: 30 })}`),
  });
  const temErros = q.data?.itens.some((i) => i.status === "erro");
  const reprocessar = useMutation({
    mutationFn: () => api("/atendimentos/reprocessar-erros", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atendimentos"] }),
  });

  return (
    <>
      <Titulo
        titulo="A revisar"
        descricao="Atendimentos em que a IA não encontrou a origem ou ficou em dúvida. Ao confirmar, o atendimento sai desta lista."
        acoes={
          temErros && (
            <Botao onClick={() => reprocessar.mutate()} carregando={reprocessar.isPending}>
              <RotateCcw className="size-4" /> Tentar de novo os que falharam
            </Botao>
          )
        }
      />
      {q.error && <Alerta>{(q.error as Error).message}</Alerta>}
      {!q.data ? (
        <Carregando />
      ) : q.data.itens.length === 0 ? (
        <Cartao>
          <Vazio titulo="Tudo em dia">Nenhum atendimento aguardando revisão.</Vazio>
        </Cartao>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted tabular">{q.data.total} atendimento(s) aguardando</p>
          {q.data.itens.map((a) => (
            <Cartao key={a.id}>
              <div className="grid gap-4 pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
                <div className="grid min-w-0 content-start gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link to={`/atendimentos/${a.id}`} className="font-medium hover:underline">
                      {a.clienteNome}
                    </Link>
                    <span className="text-xs text-muted tabular">{telefone(a.clienteTelefone)}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="flex items-center gap-2 text-xs text-ink-2">
                    <Ponto cor={a.empresaCor} className="size-2" /> {a.empresaNome} · {a.vendedorNome} · {dataHora(a.ultimaAtribuicaoEm)}
                  </p>
                  {a.resumo ? (
                    (() => {
                      const t = trechoParaRevisao(a.resumo);
                      return (
                        <div className="grid gap-1">
                          {t.titulo && <p className="text-xs font-medium text-muted">{t.titulo}</p>}
                          <p className="line-clamp-6 whitespace-pre-wrap text-sm text-ink">{t.texto}</p>
                          <Link to={`/atendimentos/${a.id}`} className="w-fit text-xs text-accent-ink hover:underline">
                            Ver resumo completo
                          </Link>
                        </div>
                      );
                    })()
                  ) : (
                    <p className="text-sm text-muted">Sem resumo.</p>
                  )}
                  {a.sugestao && (
                    <p className="text-xs text-muted">
                      A IA sugere criar a origem <b className="text-ink-2">“{a.sugestao}”</b>.
                    </p>
                  )}
                </div>
                <EditorClassificacao atendimento={a} compacto />
              </div>
            </Cartao>
          ))}
        </div>
      )}
    </>
  );
}
