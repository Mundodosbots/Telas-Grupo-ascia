import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type AtendimentoDetalhe } from "../api";
import { EditorClassificacao } from "../components/EditorClassificacao";
import { Markdown } from "../components/Markdown";
import { Alerta, Cartao, Carregando, Chip, cx, Ponto, StatusBadge } from "../components/ui";
import { dataHora, telefone } from "../lib/formato";

export function PaginaAtendimento() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["atendimento", id],
    queryFn: () => api<AtendimentoDetalhe>(`/atendimentos/${id}`),
    // Enquanto a IA trabalha, atualiza sozinho
    refetchInterval: (query) => (["pendente", "processando"].includes(query.state.data?.status ?? "") ? 3000 : false),
  });

  if (q.error) return <Alerta>{(q.error as Error).message}</Alerta>;
  if (!q.data) return <Carregando />;
  const a = q.data;

  return (
    <div className="grid gap-4">
      <button
        // Aberto por link direto (sem histórico no app)? Volta para a lista em vez de sair do sistema
        onClick={() => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav("/atendimentos"))}
        className="flex w-fit items-center gap-1 text-sm text-muted hover:text-ink cursor-pointer">
        <ArrowLeft className="size-4" /> Voltar
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{a.clienteNome}</h1>
          <p className="text-sm text-muted tabular">{telefone(a.clienteTelefone)}</p>
        </div>
        <StatusBadge status={a.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid min-w-0 content-start gap-4">
          <Cartao titulo="Resumo da conversa">
            {a.resumo ? <Markdown texto={a.resumo} /> : <p className="text-sm text-muted">O bot não enviou resumo.</p>}
            {a.fonteInformada && (
              <p className="mt-3 text-xs text-muted">
                Fonte informada pelo bot: <span className="font-medium text-ink-2">{a.fonteInformada}</span>
              </p>
            )}
          </Cartao>

          <Cartao titulo="Classificação">
            <div className="mb-4 grid gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
              {a.status === "manual" ? (
                <p className="text-ink-2">
                  Conferido por <b className="text-ink">{a.classificadoPor ?? "usuário"}</b> em {dataHora(a.classificadoEm)}.
                </p>
              ) : a.status === "pendente" || a.status === "processando" ? (
                <p className="text-ink-2">A IA ainda vai analisar este atendimento.</p>
              ) : a.status === "erro" ? (
                <p className="text-bad">A IA falhou {a.tentativas}× ao analisar: {a.erro}</p>
              ) : (
                <>
                  <p className="text-ink-2">
                    <b className="text-ink">{a.origemPorRegra ? "Origem definida por regra" : "Análise da IA"}</b>
                    {!a.origemPorRegra && a.confianca !== null && <> · confiança {Math.round(a.confianca * 100)}%</>}
                  </p>
                  {a.justificativa &&
                    a.justificativa.split(" | IA: ").map((parte, i) => (
                      <p key={i} className="text-ink-2">
                        {i === 1 && <b className="text-ink">Etiquetas pela IA: </b>}“{parte}”
                      </p>
                    ))}
                  {a.sugestao && (
                    <p className="text-ink-2">
                      Nenhuma origem cadastrada serviu. Sugestão: <b className="text-ink">{a.sugestao}</b>
                    </p>
                  )}
                </>
              )}
            </div>
            <EditorClassificacao key={`${a.origemId}-${a.status}-${a.etiquetas.map((e) => e.id).join()}`} atendimento={a} />
          </Cartao>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Cartao titulo="Dados">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Empresa</dt>
              <dd className="flex items-center gap-2">
                <Ponto cor={a.empresaCor} /> {a.empresaNome}
              </dd>
              <dt className="text-muted">Vendedor</dt>
              <dd className="font-medium">{a.vendedorNome}</dd>
              <dt className="text-muted">Origem</dt>
              <dd>{a.origemNome ? <Chip cor={a.origemCor}>{a.origemNome}</Chip> : "—"}</dd>
              <dt className="text-muted">Etiquetas</dt>
              <dd className="flex flex-wrap gap-1">
                {a.etiquetas.length
                  ? a.etiquetas.map((e) => (
                      <Chip key={e.id} cor={e.cor}>
                        {e.nome}
                      </Chip>
                    ))
                  : "—"}
              </dd>
              <dt className="text-muted">1ª atribuição</dt>
              <dd className="tabular">{dataHora(a.primeiraAtribuicaoEm)}</dd>
              <dt className="text-muted">Última</dt>
              <dd className="tabular">{dataHora(a.ultimaAtribuicaoEm)}</dd>
              {a.conversaId && (
                <>
                  <dt className="text-muted">Conversa</dt>
                  <dd className="truncate font-mono text-xs">{a.conversaId}</dd>
                </>
              )}
            </dl>
          </Cartao>

          {(a.etiquetasPlataforma.length > 0 || Object.keys(a.camposPlataforma ?? {}).length > 0 || a.clienteIdExterno) && (
            <Cartao titulo="Dados da plataforma">
              <dl className="grid gap-3 text-sm">
                {a.clienteIdExterno && (
                  <div className="grid gap-0.5">
                    <dt className="text-xs text-muted">ID do contato</dt>
                    <dd className="font-mono text-xs">{a.clienteIdExterno}</dd>
                  </div>
                )}
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted">Fonte do contato</dt>
                  <dd>{a.fonteInformada ?? <span className="text-muted">não informada</span>}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted">Etiquetas na plataforma</dt>
                  <dd className="flex flex-wrap gap-1">
                    {a.etiquetasPlataforma.length ? (
                      a.etiquetasPlataforma.map((e) => (
                        <span
                          key={e}
                          title={e.startsWith("#") ? "Etiqueta sem nome: importe as etiquetas em Empresas e webhook" : undefined}
                          className={cx(
                            "rounded-full border px-2 py-0.5 text-xs",
                            e.startsWith("#") ? "border-warn text-warn" : "border-line bg-surface-2 text-ink-2",
                          )}
                        >
                          {e}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted">nenhuma</span>
                    )}
                  </dd>
                </div>
                {Object.keys(a.camposPlataforma ?? {}).length > 0 && (
                  <div className="grid gap-1">
                    <dt className="text-xs text-muted">Campos preenchidos</dt>
                    <dd className="grid gap-1">
                      {Object.entries(a.camposPlataforma).map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2 text-xs">
                          <span className="truncate text-muted" title={k}>
                            {k}
                          </span>
                          <span className="break-words text-ink">{v}</span>
                        </div>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </Cartao>
          )}

          <Cartao titulo={`Linha do tempo · ${a.linhaDoTempo.length} atribuiç${a.linhaDoTempo.length === 1 ? "ão" : "ões"}`}>
            <ol className="relative grid gap-4 border-l border-line pl-5">
              {a.linhaDoTempo.map((t, i) => {
                const ultimo = i === a.linhaDoTempo.length - 1;
                return (
                  <li key={t.id} className="relative">
                    <span
                      className={cx(
                        "absolute -left-[26px] top-1 size-3 rounded-full border-2",
                        ultimo ? "border-good bg-good" : "border-line bg-surface",
                      )}
                    />
                    <p className="text-sm">
                      <b>{t.vendedorNome}</b>
                      {ultimo && a.linhaDoTempo.length > 1 && <span className="ml-2 text-xs text-good">conta aqui</span>}
                    </p>
                    <p className="text-xs text-muted tabular">{dataHora(t.atribuidoEm)}</p>
                    {t.fonte && <p className="text-xs text-muted">Fonte: {t.fonte}</p>}
                    <details className="group mt-1">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-accent-ink">
                        <ChevronDown className="size-3 transition-transform group-open:rotate-180" /> Ver dados recebidos
                      </summary>
                      {t.resumo && <p className="mt-1.5 whitespace-pre-wrap text-xs text-ink-2">{t.resumo}</p>}
                      <pre className="mt-1.5 max-h-60 overflow-auto rounded-md bg-surface-2 p-2 text-[11px] leading-snug">
                        {JSON.stringify(t.payload ?? t.dadosExtras, null, 2)}
                      </pre>
                    </details>
                  </li>
                );
              })}
            </ol>
          </Cartao>

          {a.outrosAtendimentos.length > 0 && (
            <Cartao titulo="Outros atendimentos deste cliente">
              <ul className="grid gap-1.5 text-sm">
                {a.outrosAtendimentos.map((o) => (
                  <li key={o.id}>
                    <Link to={`/atendimentos/${o.id}`} className="flex justify-between gap-3 hover:underline">
                      <span>{o.vendedorNome}</span>
                      <span className="text-xs text-muted tabular">{dataHora(o.ultimaAtribuicaoEm)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>
      </div>
    </div>
  );
}
