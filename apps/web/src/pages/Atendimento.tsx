import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type AtendimentoDetalhe, type MensagemConversa } from "../api";
import { useAuth } from "../auth";
import { Alerta, Botao, Campo, Cartao, Carregando, Chip, cx, Ponto, Selecao, StatusBadge } from "../components/ui";
import { useDepartamentos, useEtiquetas, useOrigens } from "../hooks";
import { dataHora, duracao, telefone } from "../lib/formato";

export function PaginaAtendimento() {
  const { id } = useParams();
  const { empresa } = useAuth();
  const navegar = useNavigate();
  const q = useQuery({
    queryKey: ["atendimento", empresa?.id, id],
    queryFn: () => api<AtendimentoDetalhe>(`/atendimentos/${id}`),
    refetchInterval: (query) => (["pendente", "processando"].includes(query.state.data?.classificacaoStatus ?? "") ? 3000 : false),
    enabled: !!empresa,
  });
  const voltar = () => (window.history.state?.idx > 0 ? navegar(-1) : navegar("/atendimentos"));

  if (q.error) return <Alerta>{(q.error as Error).message}</Alerta>;
  if (!q.data) return <Carregando />;
  const a = q.data;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={voltar} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink cursor-pointer">
            <ArrowLeft className="size-4" /> Voltar
          </button>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {a.contato.nome || "Sem nome"}
            {a.leadNovo && <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">Lead novo</span>}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <Ponto cor={a.chatbotCor} /> {a.chatbotNome}
            </span>
            {a.contato.telefone && <span>· {telefone(a.contato.telefone)}</span>}
            {a.protocolo && <span>· protocolo {a.protocolo}</span>}
            <span>· {dataHora(a.inicioEm)}</span>
          </p>
        </div>
        {a.contato.linkConversa && (
          <a href={a.contato.linkConversa} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-2">
            <ExternalLink className="size-4" /> Abrir na plataforma
          </a>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tempo rotulo="Robô → humano" valor={a.semHumano ? "Sem humano" : duracao(a.tempoAteHumanoS)} ruim={a.semHumano || a.atendidoAte30 === false} bom={a.atendidoAte30 === true} />
        <Tempo rotulo="1ª resposta humana" valor={duracao(a.tempoPrimeiraRespostaS)} sub="desde a 1ª mensagem do cliente" />
        <Tempo rotulo="Resposta média" valor={duracao(a.tempoMedioRespostaS)} sub={a.tempoMaxRespostaS ? `máx. ${duracao(a.tempoMaxRespostaS)}` : undefined} />
        <Tempo rotulo="Esperas > 30 min" valor={String(a.esperasAcima30)} sub={a.semResposta ? `${a.semResposta} sem resposta` : undefined} ruim={a.esperasAcima30 > 0} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Cartao
          titulo={`Conversa · ${a.conversa.length} mensagens`}
          acao={
            <span className="text-xs text-muted">
              {a.msgsCliente} do cliente · {a.msgsBot + a.msgsApi} automáticas · {a.msgsHumano} do atendente
            </span>
          }
        >
          {a.foraHorario && <Alerta tipo="info">O cliente chegou fora do horário de atendimento — os tempos contam a partir da abertura.</Alerta>}
          <Conversa msgs={a.conversa} fuso={a.fuso} />
        </Cartao>

        <div className="grid content-start gap-5">
          <Organizacao a={a} />
          <Cartao titulo="Quem atendeu">
            {a.humanos.length ? (
              <ol className="grid gap-2 text-sm">
                {a.humanos.map((h) => (
                  <li key={h.atendenteId} className="flex items-baseline justify-between gap-2">
                    <span>
                      <span className="text-muted">{h.ordem + 1}º</span> <span className="font-medium">{h.nome}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {h.mensagens} msg · desde {dataHora(h.primeiraMsgEm)}
                    </span>
                  </li>
                ))}
                {a.transferencias > 0 && <li className="text-xs text-muted">{a.transferencias} transferência(s) entre atendentes</li>}
              </ol>
            ) : (
              <p className="text-sm text-muted">{a.precisouHumano ? "Foi para a fila, mas nenhum humano respondeu." : "Resolvido só pelo robô."}</p>
            )}
          </Cartao>
          <Cartao titulo="Entrada">
            <dl className="grid gap-1.5 text-sm">
              <Linha rotulo="Fonte">{a.fonte}</Linha>
              <Linha rotulo="Canal">{a.canal}</Linha>
              <Linha rotulo="Ref. entrada">{a.refEntrada}</Linha>
              {a.anuncio && (
                <>
                  <Linha rotulo="Anúncio">{a.anuncio.plataforma}</Linha>
                  <Linha rotulo="Campanha">{a.anuncio.campanha ?? a.anuncio.nome}</Linha>
                  {a.anuncio.link && (
                    <Linha rotulo="Link">
                      <a href={a.anuncio.link} target="_blank" rel="noreferrer" className="text-accent underline break-all">
                        {a.anuncio.link}
                      </a>
                    </Linha>
                  )}
                  {a.anuncio.texto && <p className="mt-1 rounded-md bg-surface-2 p-2 text-xs text-ink-2 whitespace-pre-line">{a.anuncio.texto}</p>}
                </>
              )}
              {a.contato.etiquetas.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.contato.etiquetas.map((e) => (
                    <span key={e} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">
                      {e}
                    </span>
                  ))}
                </div>
              )}
            </dl>
          </Cartao>
          {a.outros.length > 0 && (
            <Cartao titulo="Outros atendimentos deste contato">
              <ul className="grid gap-1.5 text-sm">
                {a.outros.map((o) => (
                  <li key={o.id}>
                    <Link to={`/atendimentos/${o.id}`} className="flex justify-between gap-2 hover:underline">
                      <span>{dataHora(o.inicioEm)}</span>
                      <span className="truncate text-xs text-muted">{[o.atendenteNome, o.origemNome].filter(Boolean).join(" · ") || "—"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
          <Cartao titulo="Campos do contato">
            <dl className="grid max-h-80 gap-1 overflow-y-auto text-xs">
              {Object.entries(a.contato.campos)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
                    <dt className="truncate text-muted" title={k}>
                      {k}
                    </dt>
                    <dd className="break-words text-ink-2">{v.length > 200 ? v.slice(0, 200) + "…" : v}</dd>
                  </div>
                ))}
            </dl>
          </Cartao>
        </div>
      </div>
    </div>
  );
}

function Tempo({ rotulo, valor, sub, ruim, bom }: { rotulo: string; valor: string; sub?: string; ruim?: boolean; bom?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{rotulo}</p>
      <p className={cx("mt-0.5 text-xl font-semibold tabular", ruim && "text-bad", bom && "text-good")}>{valor}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
      <dt className="text-muted">{rotulo}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

const fmtHora = (iso: string, fuso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function Conversa({ msgs, fuso }: { msgs: MensagemConversa[]; fuso: string }) {
  const [tudo, setTudo] = useState(msgs.length <= 80);
  const visiveis = tudo ? msgs : msgs.slice(-80);
  return (
    <div className="grid gap-2">
      {!tudo && (
        <button onClick={() => setTudo(true)} className="justify-self-center text-xs text-accent hover:underline cursor-pointer">
          Mostrar as {msgs.length - 80} mensagens anteriores
        </button>
      )}
      {visiveis.map((m) => {
        const cliente = m.tipo === "cliente";
        const humano = m.tipo === "humano";
        return (
          <div key={m.id} className={cx("flex", cliente ? "justify-start" : "justify-end")}>
            <div
              className={cx(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                cliente && "rounded-bl-sm bg-surface-2 text-ink",
                humano && "rounded-br-sm bg-accent text-white",
                !cliente && !humano && "rounded-br-sm border border-line bg-surface text-ink-2",
              )}
            >
              <p className={cx("mb-0.5 text-[11px] font-medium", humano ? "text-white/80" : "text-muted")}>
                {cliente ? "Cliente" : humano ? m.remetente : m.tipo === "api" ? "Integração (API)" : "Robô"} · {fmtHora(m.em, fuso)}
              </p>
              <p className="whitespace-pre-line break-words">{m.texto}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Origem, departamento, cidade e etiquetas — da regra, da IA ou corrigidos à mão */
function Organizacao({ a }: { a: AtendimentoDetalhe }) {
  const qc = useQueryClient();
  const origens = useOrigens();
  const departamentos = useDepartamentos();
  const etiquetas = useEtiquetas();
  const [editando, setEditando] = useState(false);
  const [origem, setOrigem] = useState(a.origemId ?? "");
  const [departamento, setDepartamento] = useState(a.departamentoId ?? "");
  const [cidade, setCidade] = useState(a.cidade ?? "");
  const [tags, setTags] = useState(new Set(a.etiquetas.map((e) => e.id)));
  const atualizar = () => qc.invalidateQueries();
  const salvar = useMutation({
    mutationFn: () =>
      api(`/atendimentos/${a.id}`, {
        method: "PATCH",
        body: { origem_id: origem || null, departamento_id: departamento || null, cidade: cidade || null, etiqueta_ids: [...tags] },
      }),
    onSuccess: () => {
      setEditando(false);
      atualizar();
    },
  });
  const reorganizar = useMutation({ mutationFn: () => api(`/atendimentos/${a.id}/reorganizar`, { method: "POST" }), onSuccess: atualizar });

  return (
    <Cartao titulo="Organização" acao={<StatusBadge status={a.classificacaoStatus} />}>
      {!editando ? (
        <div className="grid gap-2 text-sm">
          {a.interesse && <p className="font-medium">{a.interesse}</p>}
          {a.resumo && <p className="text-ink-2">{a.resumo}</p>}
          <dl className="mt-1 grid gap-1.5">
            <Linha rotulo="Origem">
              {a.origemNome && (
                <span className="inline-flex flex-wrap items-center gap-1">
                  <Chip cor={a.origemCor}>{a.origemNome}</Chip>
                  {a.origemPorRegra && <span className="text-xs text-muted">pela regra</span>}
                </span>
              )}
            </Linha>
            <Linha rotulo="Departamento">{a.departamentoNome && <Chip cor={a.departamentoCor}>{a.departamentoNome}</Chip>}</Linha>
            <Linha rotulo="Cidade">{a.cidade}</Linha>
            {a.etiquetas.length > 0 && (
              <Linha rotulo="Etiquetas">
                <span className="flex flex-wrap gap-1">
                  {a.etiquetas.map((e) => (
                    <Chip key={e.id} cor={e.cor}>
                      {e.nome}
                    </Chip>
                  ))}
                </span>
              </Linha>
            )}
          </dl>
          {a.classificacaoJustificativa && <p className="text-xs text-muted">{a.classificacaoJustificativa}</p>}
          {a.classificadoPor && <p className="text-xs text-muted">Corrigido por {a.classificadoPor}</p>}
          {a.classificacaoErro && a.classificacaoStatus === "erro" && <Alerta>{a.classificacaoErro}</Alerta>}
          <div className="mt-1 flex flex-wrap gap-2">
            <Botao onClick={() => setEditando(true)}>Corrigir</Botao>
            <Botao variante="fantasma" carregando={reorganizar.isPending} onClick={() => reorganizar.mutate()}>
              <RefreshCw className="size-4" /> Pedir à IA de novo
            </Botao>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          {salvar.error && <Alerta>{(salvar.error as Error).message}</Alerta>}
          <Selecao rotulo="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)}>
            <option value="">Sem origem</option>
            {(origens.data ?? []).filter((o) => o.ativo || o.id === origem).map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="Departamento" value={departamento} onChange={(e) => setDepartamento(e.target.value)}>
            <option value="">Sem departamento</option>
            {(departamentos.data ?? []).filter((o) => o.ativo || o.id === departamento).map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
          <Campo rotulo="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {(etiquetas.data ?? []).filter((e) => e.ativo).map((e) => {
              const marcada = tags.has(e.id);
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => {
                    const n = new Set(tags);
                    if (marcada) n.delete(e.id);
                    else n.add(e.id);
                    setTags(n);
                  }}
                  className={cx("rounded-full border px-2.5 py-1 text-xs cursor-pointer", marcada ? "border-ink bg-ink text-surface" : "border-line text-ink-2")}
                >
                  {e.nome}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">Depois de corrigido, a IA não mexe mais neste atendimento.</p>
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="fantasma" onClick={() => setEditando(false)}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvar.isPending}>
              Salvar
            </Botao>
          </div>
        </form>
      )}
    </Cartao>
  );
}
