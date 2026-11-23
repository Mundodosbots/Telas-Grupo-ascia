import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, Hourglass, MessageSquareOff, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, type AtendimentoDetalhe, type HistoricoCliente, type MensagemConversa } from "../api";
import { useAuth } from "../auth";
import { Alerta, Botao, Campo, Cartao, Carregando, Chip, cx, Dica, Ponto, Selecao, StatusBadge } from "../components/ui";
import { useDepartamentos, useEtiquetas, useOrigens } from "../hooks";
import { dataHora, duracao, telefone } from "../lib/formato";
import { GLOSSARIO } from "../lib/glossario";

const LIMITE = 30 * 60;

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

  const [sp] = useSearchParams();
  const [foco, setFoco] = useState<string | null>(null);
  /** Conversa só deste atendimento ou a linha do tempo inteira do cliente (padrão quando há outros) */
  const [visao, setVisao] = useState<"este" | "cliente">("cliente");
  const esperas = useMemo(() => (q.data?.conversa ?? []).filter((m) => (m.esperaS ?? 0) > LIMITE || m.semResposta), [q.data]);
  const pior = useMemo(
    () => (q.data?.conversa ?? []).reduce<MensagemConversa | null>((p, m) => (m.esperaS !== undefined && (!p || m.esperaS > (p.esperaS ?? 0)) ? m : p), null),
    [q.data],
  );
  const irPara = (id?: string) => id && setFoco(id);
  // Veio da lista de "esperas": abre direto na pior espera (as sem resposta contam como as piores)
  useEffect(() => {
    if (!q.data || foco) return;
    if (sp.get("ver") === "humano") {
      const c = q.data.conversa;
      // Sem resposta humana: mostra a última mensagem do cliente (a que ficou esperando)
      return void irPara(
        c.find((m) => m.marco === "primeira_humana")?.id ?? c.find((m) => m.marco === "transferencia")?.id ?? [...c].reverse().find((m) => m.tipo === "cliente")?.id,
      );
    }
    if (sp.get("ver") !== "esperas") return;
    const ordenadas = [...esperas].sort((x, y) => (y.semResposta ? 1e12 : (y.esperaS ?? 0)) - (x.semResposta ? 1e12 : (x.esperaS ?? 0)));
    irPara(ordenadas[0]?.id ?? pior?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  if (q.error) return <Alerta>{(q.error as Error).message}</Alerta>;
  if (!q.data) return <Carregando />;
  const a = q.data;
  // Tempo de relógio (sem descontar o fora do horário) entre o início da fila e a 1ª resposta humana
  const inicioFila = a.transferenciaEm ?? a.primeiraMsgClienteEm;
  const corridoAteHumano =
    inicioFila && a.primeiraRespostaHumanaEm && !a.iniciadoPelaEmpresa ? Math.max(0, (Date.parse(a.primeiraRespostaHumanaEm) - Date.parse(inicioFila)) / 1000) : null;

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
        <Tempo
          rotulo="Robô → humano"
          dica={a.iniciadoPelaEmpresa ? GLOSSARIO.contatoAtivo : GLOSSARIO.roboHumano}
          valor={
            a.iniciadoPelaEmpresa
              ? "Contato ativo"
              : a.semHumano
                ? "Sem humano"
                : a.historicoIncompleto && a.tempoAteHumanoS === null
                  ? "Incompleto"
                  : !a.precisouHumano
                    ? "Só robô"
                    : duracao(a.tempoAteHumanoS)
          }
          sub={
            a.iniciadoPelaEmpresa
              ? "o atendente começou a conversa"
              : corridoAteHumano !== null && a.tempoAteHumanoS !== null && corridoAteHumano - a.tempoAteHumanoS > 600
                ? `no relógio: ${duracao(corridoAteHumano)} (fora do horário)`
                : undefined
          }
          ruim={a.semHumano || a.atendidoAte30 === false}
          bom={a.atendidoAte30 === true}
          onClick={() =>
            irPara(
              a.conversa.find((m) => m.marco === "primeira_humana" || m.marco === "contato_ativo")?.id ?? a.conversa.find((m) => m.marco === "transferencia")?.id,
            )
          }
        />
        <Tempo
          rotulo="1ª resposta humana"
          dica={GLOSSARIO.primeiraResposta}
          valor={a.iniciadoPelaEmpresa ? "—" : duracao(a.tempoPrimeiraRespostaS)}
          sub={a.iniciadoPelaEmpresa ? "não se aplica: a empresa puxou a conversa" : "desde a 1ª mensagem do cliente"}
        />
        <Tempo
          rotulo="Resposta média"
          dica={GLOSSARIO.respostaMedia}
          valor={duracao(a.tempoMedioRespostaS)}
          sub={a.tempoMaxRespostaS ? `máx. ${duracao(a.tempoMaxRespostaS)} · clique para ver` : undefined}
          onClick={a.tempoMaxRespostaS ? () => irPara(pior?.id) : undefined}
        />
        <Tempo
          rotulo="Esperas > 30 min"
          dica={GLOSSARIO.esperas30}
          valor={String(a.esperasAcima30)}
          sub={a.semResposta ? `${a.semResposta} sem resposta` : a.esperasAcima30 ? "clique para ver" : undefined}
          ruim={a.esperasAcima30 > 0}
          onClick={esperas.length ? () => irPara(esperas[0]!.id) : undefined}
        />
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
          {a.historicoIncompleto && (
            <div className="mb-3">
              <Alerta tipo="aviso">
                Histórico incompleto: a plataforma não mandou um trecho desta conversa (o fim dela ficou de fora do envio). Os tempos são parciais e este atendimento não
                conta como "sem atendimento humano".
              </Alerta>
            </div>
          )}
          {a.foraHorario && a.primeiraMsgClienteEm && (
            <div className="mb-3">
              <Alerta tipo="info">
                O cliente escreveu {quando(a.primeiraMsgClienteEm, a.fuso)}, fora do horário de atendimento do chatbot. Os tempos do painel só contam o horário de
                atendimento: o relógio começa a correr quando a loja abre.
                {corridoAteHumano !== null && a.tempoAteHumanoS !== null && (
                  <>
                    {" "}
                    Por isso o robô → humano aparece como <b>{duracao(a.tempoAteHumanoS)}</b>, mas no relógio o cliente esperou <b>{duracao(corridoAteHumano)}</b> pela 1ª
                    resposta.
                  </>
                )}
              </Alerta>
            </div>
          )}
          {a.outros.length > 0 && (
            <div className="mb-3 flex w-fit rounded-lg border border-line p-0.5 text-xs" role="tablist">
              {(
                [
                  ["este", `Este atendimento (${a.conversa.length} msg)`],
                  ["cliente", `Tudo do cliente (${a.outros.length + 1} atendimentos)`],
                ] as const
              ).map(([v, rotulo]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={visao === v}
                  onClick={() => setVisao(v)}
                  className={cx("rounded-md px-2.5 py-1 cursor-pointer", visao === v ? "bg-ink text-surface font-medium" : "text-ink-2 hover:text-ink")}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          )}
          {visao === "cliente" && a.outros.length > 0 ? (
            <HistoricoDoCliente atual={a} foco={foco} onIr={irPara} />
          ) : (
            <Conversa msgs={a.conversa} fuso={a.fuso} foco={foco} onIr={irPara} />
          )}
        </Cartao>

        <div className="grid content-start gap-5">
          {a.precisouHumano && <Esperas msgs={a.conversa} fuso={a.fuso} foco={foco} onIr={irPara} />}
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
                {a.semHumano && <li className="text-xs font-medium text-bad">Só mandou o encerramento: o cliente não recebeu resposta de um atendente.</li>}
              </ol>
            ) : (
              <p className="text-sm text-muted">{a.historicoIncompleto ? "Não dá para saber: o trecho em que o atendente entraria não veio no envio." : a.precisouHumano ? "Foi para a fila, mas nenhum humano respondeu." : "Resolvido só pelo robô."}</p>
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

function Tempo({ rotulo, dica, valor, sub, ruim, bom, onClick }: { rotulo: string; dica?: string; valor: string; sub?: string; ruim?: boolean; bom?: boolean; onClick?: () => void }) {
  return (
    <div className={cx("relative rounded-xl border border-line bg-surface px-4 py-3", onClick && "hover:border-accent")}>
      {onClick && <button onClick={onClick} className="absolute inset-0 rounded-xl cursor-pointer" aria-label={`${rotulo}: ver na conversa`} />}
      <p className="flex items-center gap-1 text-xs text-muted">
        {rotulo} {dica && <Dica texto={dica} className="relative z-10" />}
      </p>
      <p className={cx("mt-0.5 text-xl font-semibold tabular", ruim && "text-bad", bom && "text-good")}>{valor}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Lista das esperas da conversa: clique leva à mensagem */
function Esperas({ msgs, fuso, foco, onIr }: { msgs: MensagemConversa[]; fuso: string; foco: string | null; onIr: (id: string) => void }) {
  const itens = msgs.filter((m) => m.esperaS !== undefined || m.semResposta || m.marco);
  const longas = itens.filter((m) => (m.esperaS ?? 0) > LIMITE || m.semResposta);
  const i = longas.findIndex((m) => m.id === foco);
  return (
    <Cartao
      titulo="Esperas nesta conversa"
      dica="Cada vez que o cliente escreveu e ficou esperando o atendente. Clique para ir até a mensagem na conversa. Em vermelho, as que passaram de 30 minutos (em horário de atendimento) ou ficaram sem resposta."
      acao={longas.length > 1 && <NavEsperas longas={longas} i={i} onIr={onIr} />}
    >
      {!itens.length ? (
        <p className="text-sm text-muted">Nenhuma espera medida.</p>
      ) : (
        <ol className="-mx-2 grid max-h-72 grid-cols-[minmax(0,1fr)] gap-0.5 overflow-y-auto overflow-x-hidden">
          {itens.map((m) => {
            const ruim = (m.esperaS ?? 0) > LIMITE || m.semResposta;
            return (
              <li key={m.id}>
                <button
                  onClick={() => onIr(m.id)}
                  className={cx("flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-surface-2 cursor-pointer", foco === m.id && "bg-surface-2")}
                >
                  <span className="w-20 shrink-0 text-muted tabular">{fmtHora(m.em, fuso)}</span>
                  <span className={cx("min-w-0 flex-1 truncate", m.marco ? "font-medium text-ink" : "text-ink-2")}>
                    {m.marco === "transferencia"
                      ? "Robô transferiu"
                      : m.marco === "primeira_humana"
                        ? `${m.remetente} respondeu`
                        : m.marco === "contato_ativo"
                          ? `${m.remetente} iniciou a conversa`
                          : m.marco === "encerramento"
                            ? "Encerramento"
                            : m.texto}
                  </span>
                  {m.semResposta ? (
                    <span className="font-medium text-bad">sem resposta</span>
                  ) : m.esperaS !== undefined ? (
                    <span className={cx("tabular", ruim ? "font-semibold text-bad" : "text-ink-2")}>{duracao(m.esperaS)}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Cartao>
  );
}

function Marco({ children }: { children: ReactNode }) {
  return (
    <div className="my-1 flex w-full items-center gap-2 text-[11px] text-muted">
      <span className="h-px flex-1 bg-line" />
      {children}
      <span className="h-px flex-1 bg-line" />
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

/** ↑ 2/5 ↓ — anda entre as esperas longas da conversa */
function NavEsperas({ longas, i, onIr }: { longas: MensagemConversa[]; i: number; onIr: (id: string) => void }) {
  const ir = (passo: number) => onIr(longas[(Math.max(i, passo > 0 ? -1 : 0) + passo + longas.length) % longas.length]!.id);
  return (
    <span className="flex items-center gap-1">
      <button onClick={() => ir(-1)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer" aria-label="Espera anterior">
        <ChevronUp className="size-4" />
      </button>
      <span className="text-xs text-muted tabular">
        {i >= 0 ? i + 1 : "–"}/{longas.length}
      </span>
      <button onClick={() => ir(1)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer" aria-label="Próxima espera">
        <ChevronDown className="size-4" />
      </button>
    </span>
  );
}

function Conversa({ msgs, fuso, foco, onIr }: { msgs: MensagemConversa[]; fuso: string; foco: string | null; onIr: (id: string) => void }) {
  const [tudo, setTudo] = useState(msgs.length <= 80);
  const visiveis = tudo ? msgs : msgs.slice(-80);
  const longas = msgs.filter((m) => (m.esperaS ?? 0) > LIMITE || m.semResposta);
  // Foco numa mensagem (vindo das esperas): mostra as anteriores se preciso e rola até ela
  useEffect(() => {
    if (!foco) return;
    if (!tudo && !visiveis.some((m) => m.id === foco)) return setTudo(true);
    document.getElementById(`msg-${foco}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco, tudo]);
  return (
    <div className="grid gap-2">
      {longas.length > 0 && (
        <div className="sticky top-3 z-10 flex items-center gap-2 justify-self-center rounded-full border border-bad/40 bg-surface py-0.5 pl-3 pr-1 text-xs shadow-md">
          <Hourglass className="size-3.5 text-bad" />
          <span className="text-ink-2">
            {longas.length} espera(s) longa(s) ou sem resposta
          </span>
          <NavEsperas longas={longas} i={longas.findIndex((m) => m.id === foco)} onIr={onIr} />
        </div>
      )}
      {!tudo && (
        <button onClick={() => setTudo(true)} className="justify-self-center text-xs text-accent hover:underline cursor-pointer">
          Mostrar as {msgs.length - 80} mensagens anteriores
        </button>
      )}
      {visiveis.map((m) => {
        const cliente = m.tipo === "cliente";
        const humano = m.tipo === "humano";
        const longa = (m.esperaS ?? 0) > LIMITE;
        return (
          <div key={m.id} id={`msg-${m.id}`} className={cx("grid scroll-mt-24 gap-1", cliente ? "justify-items-start" : "justify-items-end")}>
            {m.marco === "transferencia" && <Marco>Robô transferiu para o atendimento humano: a espera começa aqui</Marco>}
            {m.marco === "primeira_humana" && <Marco>1ª resposta de um atendente</Marco>}
            {m.marco === "contato_ativo" && <Marco>O atendente começou a conversa (contato ativo): não há espera do robô até o humano</Marco>}
            <div
              className={cx(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                foco === m.id && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                cliente && (longa || m.semResposta) && "outline outline-1 outline-bad",
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
            {m.semResposta ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-bad">
                <MessageSquareOff className="size-3" /> Ficou sem resposta do atendente
              </span>
            ) : m.esperaS !== undefined ? (
              <span className={cx("inline-flex items-center gap-1 text-[11px]", longa ? "font-medium text-bad" : "text-muted")}>
                <Hourglass className="size-3" /> Esperou {duracao(m.esperaS)} pela resposta{longa && " (mais de 30 min)"}
              </span>
            ) : null}
            {m.marco === "encerramento" && <Marco>Atendimento encerrado · o que vem depois (ex.: resposta da pesquisa) não conta como espera</Marco>}
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

/** "domingo, 22/11 às 18:46" no fuso do chatbot */
function quando(iso: string, fuso: string) {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, weekday: "long" }).format(d);
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${dia}, ${data} às ${hora}`;
}

type ItemHistorico = HistoricoCliente["atendimentos"][number];

/**
 * Linha do tempo do cliente: todos os atendimentos em ordem, cada um com uma faixa de resumo.
 * O atendimento aberto vem expandido; os outros abrem com um clique, sem sair da página.
 */
function HistoricoDoCliente({ atual, foco, onIr }: { atual: AtendimentoDetalhe; foco: string | null; onIr: (id: string) => void }) {
  const { empresa } = useAuth();
  const q = useQuery({
    queryKey: ["historico-cliente", empresa?.id, atual.id, atual.ultimaMsgEm],
    queryFn: () => api<HistoricoCliente>(`/atendimentos/${atual.id}/historico-cliente`),
    enabled: !!empresa,
  });
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set([atual.id]));
  if (q.error) return <Alerta>{(q.error as Error).message}</Alerta>;
  if (!q.data) return <Carregando texto="Carregando o histórico do cliente…" />;
  const porAtendimento = new Map<string, MensagemConversa[]>();
  const soltas: MensagemConversa[] = [];
  for (const m of q.data.mensagens) {
    if (m.atendimentoId) porAtendimento.set(m.atendimentoId, [...(porAtendimento.get(m.atendimentoId) ?? []), m]);
    else soltas.push(m);
  }
  const alternar = (id: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todosAbertos = q.data.atendimentos.every((x) => abertos.has(x.id));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {q.data.atendimentos.length} atendimento(s) deste cliente, do mais antigo ao mais recente. Clique numa faixa para abrir a conversa.
        </span>
        <button
          onClick={() => setAbertos(todosAbertos ? new Set([atual.id]) : new Set(q.data!.atendimentos.map((x) => x.id)))}
          className="font-medium text-accent hover:underline cursor-pointer"
        >
          {todosAbertos ? "Recolher os outros" : "Abrir todos"}
        </button>
      </div>
      {q.data.atendimentos.map((x) => {
        const msgs = x.id === atual.id ? atual.conversa : (porAtendimento.get(x.id) ?? []);
        const aberto = abertos.has(x.id);
        return (
          <section key={x.id} className={cx("rounded-xl border", x.id === atual.id ? "border-accent" : "border-line")}>
            <FaixaAtendimento x={x} total={msgs.length} atual={x.id === atual.id} aberto={aberto} fuso={atual.fuso} onAlternar={() => alternar(x.id)} />
            {aberto && (
              <div className="border-t border-line p-3">
                {msgs.length ? (
                  <Conversa msgs={msgs} fuso={atual.fuso} foco={x.id === atual.id ? foco : null} onIr={x.id === atual.id ? onIr : () => {}} />
                ) : (
                  <p className="text-sm text-muted">Sem mensagens guardadas.</p>
                )}
              </div>
            )}
          </section>
        );
      })}
      {soltas.length > 0 && (
        <details className="rounded-xl border border-dashed border-line px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted">{soltas.length} mensagem(ns) fora de qualquer atendimento</summary>
          <div className="mt-2">
            <Conversa msgs={soltas} fuso={atual.fuso} foco={null} onIr={() => {}} />
          </div>
        </details>
      )}
    </div>
  );
}

function FaixaAtendimento({
  x,
  total,
  atual,
  aberto,
  fuso,
  onAlternar,
}: {
  x: ItemHistorico;
  total: number;
  atual: boolean;
  aberto: boolean;
  fuso: string;
  onAlternar: () => void;
}) {
  const fmt = (iso: string, opcoes: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, ...opcoes }).format(new Date(iso));
  const mesmoDia = fmt(x.inicioEm, { dateStyle: "short" }) === fmt(x.ultimaMsgEm, { dateStyle: "short" });
  const periodo = `${fmt(x.inicioEm, { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })} → ${fmt(
    x.ultimaMsgEm,
    mesmoDia ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" },
  )}`;
  const situacao = x.iniciadoPelaEmpresa
    ? { texto: "Contato ativo", classe: "bg-accent-soft text-accent-ink" }
    : x.historicoIncompleto
      ? { texto: "Incompleto", classe: "bg-warn-soft text-warn" }
      : x.semHumano
        ? { texto: "Sem humano", classe: "bg-bad-soft text-bad" }
        : !x.precisouHumano
          ? { texto: "Só robô", classe: "bg-surface-2 text-ink-2" }
          : { texto: `Robô → humano ${duracao(x.tempoAteHumanoS)}`, classe: (x.tempoAteHumanoS ?? 0) > LIMITE ? "bg-bad-soft text-bad" : "bg-good-soft text-good" };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <button onClick={onAlternar} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left cursor-pointer" aria-expanded={aberto}>
        {aberto ? <ChevronUp className="size-4 shrink-0 text-muted" /> : <ChevronDown className="size-4 shrink-0 text-muted" />}
        <span className="tabular text-ink">{periodo}</span>
        {x.protocolo && <span className="text-muted">#{x.protocolo}</span>}
        <span className="font-medium text-ink">{x.atendenteNome ?? (x.precisouHumano ? "—" : "Robô")}</span>
        <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", situacao.classe)}>{situacao.texto}</span>
        {x.esperasAcima30 > 0 && <span className="text-[11px] font-medium text-bad">{x.esperasAcima30}× espera &gt; 30 min</span>}
        <span className="text-xs text-muted">{total} msg</span>
        {x.interesse && <span className="min-w-0 truncate text-xs text-muted">· {x.interesse}</span>}
      </button>
      {atual ? (
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">este atendimento</span>
      ) : (
        <Link to={`/atendimentos/${x.id}`} className="text-xs font-medium text-accent hover:underline">
          Ver detalhes
        </Link>
      )}
    </div>
  );
}
