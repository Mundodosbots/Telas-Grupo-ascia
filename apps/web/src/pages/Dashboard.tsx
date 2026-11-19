import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, qs, type Grupo, type Painel } from "../api";
import { ListaBarras } from "../components/Barras";
import { BarraFiltros } from "../components/Filtros";
import { AreasPorDia, Colunas, COR_OUTROS, Dispersao, estiloDica, Funil, LinhaTempo, MapaRetangulos, Medidor, MiniLinha, Rosca, type PontoDia } from "../components/Graficos";
import { Titulo } from "../components/Layout";
import { Alerta, Cartao, Carregando, cx, Dica, Vazio } from "../components/ui";
import { useAuth } from "../auth";
import { linkLista, useChatbots, useFiltros } from "../hooks";
import { diaCurto, diasEntre, duracao, numero, PALETA, porcento } from "../lib/formato";
import { DIAS_SEMANA, FAIXAS, GLOSSARIO } from "../lib/glossario";

export function usePainel() {
  const { consulta } = useFiltros();
  const { empresa } = useAuth();
  const { ordem: _ordem, ...semOrdem } = consulta;
  const q = qs(semOrdem);
  return useQuery({
    queryKey: ["painel", empresa?.id, q],
    queryFn: () => api<Painel>(`/painel${q}`),
    placeholderData: (anterior) => anterior,
    enabled: !!empresa,
  });
}

export function PaginaDashboard() {
  const q = usePainel();
  return (
    <>
      <Titulo
        titulo="Painel"
        descricao="Leads, tempos de atendimento e de onde vêm os clientes. Passe o mouse (ou toque) no ⓘ para entender cada número; clique em qualquer número ou gráfico para ver quais atendimentos são."
      />
      <BarraFiltros extras={["atendente", "time", "departamento", "origem", "cidade"]} />
      {q.error ? (
        <Alerta>{(q.error as Error).message}</Alerta>
      ) : !q.data ? (
        <Carregando />
      ) : q.data.resumo.total === 0 ? (
        <Cartao>
          <Vazio titulo="Nenhum atendimento neste filtro">
            Os atendimentos aparecem quando a plataforma manda o envio no fim da conversa. Confira em{" "}
            <Link className="text-accent underline" to="/eventos">
              Envios recebidos
            </Link>{" "}
            e em{" "}
            <Link className="text-accent underline" to="/chatbots">
              Chatbots
            </Link>
            .
          </Vazio>
        </Cartao>
      ) : (
        <Conteudo d={q.data} />
      )}
    </>
  );
}

type Dia = { total: number; humano: number; semHumano: number; ate30: number; comTempo: number; somaTempo: number; leadsNovos: number };

function Conteudo({ d }: { d: Painel }) {
  const { filtros, params } = useFiltros();
  const chatbots = useChatbots();
  const r = d.resumo;
  const l = (extra: Record<string, string | undefined>) => linkLista(params, extra);
  const linkDia = (iso: string) => l({ periodo: "custom", inicio: iso, fim: iso });

  // Série diária somando os chatbots
  const { dias, pontos } = useMemo(() => {
    const isos = filtros.inicio && filtros.fim ? diasEntre(filtros.inicio, filtros.fim) : [...new Set(d.serie.map((s) => s.dia))].sort();
    const mapa = new Map<string, Dia>();
    for (const s of d.serie) {
      const x = mapa.get(s.dia) ?? { total: 0, humano: 0, semHumano: 0, ate30: 0, comTempo: 0, somaTempo: 0, leadsNovos: 0 };
      x.total += s.total;
      x.humano += s.humano;
      x.semHumano += s.semHumano;
      x.ate30 += s.ate30;
      x.comTempo += s.comTempo;
      x.somaTempo += Number(s.somaTempo);
      x.leadsNovos += s.leadsNovos;
      mapa.set(s.dia, x);
    }
    const dias = isos.map((iso) => ({ iso, ...(mapa.get(iso) ?? { total: 0, humano: 0, semHumano: 0, ate30: 0, comTempo: 0, somaTempo: 0, leadsNovos: 0 }) }));
    const pontos: PontoDia[] = dias.map((x) => ({
      iso: x.iso,
      dia: diaCurto(x.iso),
      atendidos: x.humano - x.semHumano,
      semHumano: x.semHumano,
      soRobo: x.total - x.humano,
      tempo: x.comTempo ? Math.round(x.somaTempo / x.comTempo) : null,
    }));
    return { dias, pontos };
  }, [d, filtros.inicio, filtros.fim]);
  const serie = (f: (x: Dia) => number) => dias.map(f);

  const linhas = (g: Grupo[], param?: string, comCor = false) =>
    g.map((x) => ({
      chave: x.chave ?? "nenhum",
      rotulo: x.rotulo,
      valor: x.total,
      sub: x.humano ? `${porcento(x.ate30, x.comTempo)} em até 30 min · ${duracao(x.tempoAteHumano)}` : "só robô",
      ...(comCor ? { cor: x.cor ?? COR_OUTROS } : {}),
      link: param ? l({ [param]: x.chave ?? (param === "origem" ? "nenhuma" : param === "departamento" ? "nenhum" : "") }) : undefined,
    }));
  // Agrupamentos por texto (cidade, canal…): a chave é o texto em minúsculas
  const linhasTexto = (g: Grupo[], param: string) =>
    g.map((x) => ({
      chave: x.chave || "_vazio",
      rotulo: x.rotulo,
      valor: x.total,
      sub: x.humano ? `${porcento(x.ate30, x.comTempo)} em até 30 min · ${duracao(x.tempoAteHumano)}` : "só robô",
      link: x.chave ? l({ [param]: x.chave }) : param === "interesse" ? l({ interesse: "-" }) : undefined,
    }));
  const fatias = (g: Grupo[], param: string, vazio: string) =>
    g.map((x, i) => ({ chave: x.chave ?? "_sem", rotulo: x.rotulo, valor: x.total, cor: x.cor ?? (x.chave ? PALETA[i % 8]! : COR_OUTROS), link: l({ [param]: x.chave ?? vazio }) }));

  const respondidos = r.humano - r.semHumano;
  const atendentesComTempo = d.porAtendente.filter((a) => a.chave && a.tempoAteHumano !== null);

  return (
    <div className="grid gap-5">
      {/* Números principais */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Indicador rotulo="Atendimentos" dica={GLOSSARIO.atendimentos} valor={numero(r.total)} sub={`${porcento(r.humano, r.total)} foram para humano`} link={l({})} serie={serie((x) => x.total)} />
        <Indicador rotulo="Leads novos" dica={GLOSSARIO.leadsNovos} valor={numero(r.leadsNovos)} sub={`${porcento(r.leadsNovos, r.total)} dos atendimentos`} link={l({ novo: "1" })} serie={serie((x) => x.leadsNovos)} />
        <Indicador rotulo="Foram para humano" dica={GLOSSARIO.humano} valor={numero(r.humano)} sub={`${numero(r.total - r.humano)} só com o robô`} link={l({ situacao: "humano" })} serie={serie((x) => x.humano)} />
        <Indicador
          rotulo="Sem atendimento humano"
          dica={GLOSSARIO.semHumano}
          valor={numero(r.semHumano)}
          sub={`${porcento(r.semHumano, r.humano)} de quem foi para a fila`}
          tom={r.semHumano ? "ruim" : undefined}
          link={l({ situacao: "sem_humano" })}
          serie={serie((x) => x.semHumano)}
          corSerie="var(--bad)"
        />
        <Indicador
          rotulo="Humano em até 30 min"
          dica={GLOSSARIO.ate30}
          valor={porcento(r.ate30, r.comTempo)}
          sub={`${numero(r.ate30)} de ${numero(r.comTempo)} atendidos`}
          tom="bom"
          link={l({ situacao: "ate30" })}
          serie={serie((x) => (x.comTempo ? x.ate30 / x.comTempo : 0))}
          corSerie="var(--good)"
        />
        <Indicador
          rotulo="Esperas acima de 30 min"
          dica={GLOSSARIO.esperas30}
          valor={numero(r.esperas30)}
          sub="clique para ver quem esperou"
          tom={r.esperas30 ? "ruim" : undefined}
          link={l({ situacao: "esperou30", ordem: "espera" })}
        />
        <Indicador rotulo="Robô → humano (média)" dica={GLOSSARIO.roboHumano} valor={duracao(r.tempoAteHumano)} sub="da transferência à 1ª resposta" link={l({ situacao: "humano", ordem: "humano" })} />
        <Indicador rotulo="1ª resposta (média)" dica={GLOSSARIO.primeiraResposta} valor={duracao(r.tempoPrimeiraResposta)} sub="desde a 1ª mensagem do cliente" link={l({ situacao: "respondido", ordem: "humano" })} />
        <Indicador
          rotulo="Resposta do atendente (média)"
          dica={GLOSSARIO.respostaMedia}
          valor={duracao(r.tempoMedioResposta)}
          sub={`${numero(r.respostas)} respostas medidas · máx. ${duracao(r.tempoMaxResposta)}`}
          link={l({ situacao: "respondido", ordem: "resposta" })}
        />
        <Indicador
          rotulo="Mensagens sem resposta"
          dica={GLOSSARIO.semResposta}
          valor={numero(r.semResposta)}
          sub="com atendente na conversa"
          tom={r.semResposta ? "ruim" : undefined}
          link={l({ situacao: "sem_resposta", ordem: "espera" })}
        />
        <Indicador rotulo="Chegaram fora do horário" dica={GLOSSARIO.foraHorario} valor={numero(r.foraHorario)} sub={`${porcento(r.foraHorario, r.total)} dos atendimentos`} link={l({ situacao: "fora_horario" })} />
        <Indicador rotulo="Transferências" dica={GLOSSARIO.transferencias} valor={numero(r.transferencias)} sub={`duração média ${duracao(r.duracao)}`} link={l({ situacao: "transferido" })} />
      </section>

      {/* Funil, medidor e robô × humano */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <Cartao titulo="Caminho do cliente" dica={GLOSSARIO.funil}>
          <Funil
            etapas={[
              { rotulo: "Conversaram", valor: r.total, link: l({}) },
              { rotulo: "Foram para humano", valor: r.humano, dica: GLOSSARIO.humano, link: l({ situacao: "humano" }), perda: { texto: "resolvidos pelo robô", link: l({ situacao: "so_robo" }) } },
              { rotulo: "Tiveram resposta", valor: respondidos, link: l({ situacao: "respondido" }), perda: { texto: "ficaram sem resposta humana", link: l({ situacao: "sem_humano" }) } },
              {
                rotulo: "Em até 30 min",
                valor: r.ate30,
                dica: GLOSSARIO.ate30,
                link: l({ situacao: "ate30" }),
                perda: {
                  texto: "demoraram mais de 30 min",
                  valor: r.comTempo - r.ate30,
                  link: l({ situacao: "demorou30", ordem: "humano" }),
                  extra: respondidos > r.comTempo ? `${numero(respondidos - r.comTempo)} sem tempo medido` : undefined,
                },
              },
            ]}
          />
        </Cartao>
        <Cartao titulo="Atendidos em até 30 min" dica={GLOSSARIO.medidor}>
          <Medidor valor={r.comTempo ? r.ate30 / r.comTempo : null} sub={`${numero(r.ate30)} de ${numero(r.comTempo)} · meta 80%`} link={l({ situacao: "acima30", ordem: "humano" })} />
          <p className="mt-2 text-center text-[11px] text-muted">Clique para ver os que passaram de 30 min</p>
        </Cartao>
        <Cartao titulo="Robô × humano" dica={GLOSSARIO.roboVsHumano}>
          <Rosca
            centro={numero(r.total)}
            centroSub="atendimentos"
            fatias={[
              { chave: "atendidos", rotulo: "Atendidos por humano", valor: respondidos, cor: "var(--accent)", link: l({ situacao: "respondido" }) },
              { chave: "robo", rotulo: "Só robô", valor: r.total - r.humano, cor: COR_OUTROS, link: l({ situacao: "so_robo" }) },
              { chave: "sem", rotulo: "Sem resposta humana", valor: r.semHumano, cor: "var(--bad)", link: l({ situacao: "sem_humano" }) },
            ]}
          />
        </Cartao>
      </div>

      <Cartao titulo="Atendimentos por dia" dica={GLOSSARIO.porDia} acao={<span className="text-xs text-muted">clique num dia para ver a lista</span>}>
        <SeriePorDia d={d} inicio={filtros.inicio} fim={filtros.fim} chatbots={chatbots.data ?? []} linkDia={linkDia} />
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Evolução do atendimento" dica={GLOSSARIO.tendencia}>
          <AreasPorDia
            dados={pontos}
            linkDia={linkDia}
            series={[
              { chave: "atendidos", nome: "Atendidos por humano", cor: "var(--accent)" },
              { chave: "semHumano", nome: "Sem resposta humana", cor: "var(--bad)" },
              { chave: "soRobo", nome: "Só robô", cor: COR_OUTROS },
            ]}
          />
        </Cartao>
        <Cartao titulo="Tempo do robô ao humano, por dia" dica={GLOSSARIO.tempoPorDia}>
          <LinhaTempo dados={pontos} chave="tempo" linkDia={linkDia} />
        </Cartao>
        <Cartao titulo="Quanto o cliente esperou o 1º atendente" dica={GLOSSARIO.faixasAteHumano} acao={<LegendaFaixas />}>
          <Colunas dados={faixas(d.faixasAteHumano, (i) => l({ faixa_humano: String(i), ordem: "humano" }))} />
        </Cartao>
        <Cartao titulo="Resposta média do atendente, por conversa" dica={GLOSSARIO.faixasResposta} acao={<LegendaFaixas />}>
          <Colunas dados={faixas(d.faixasResposta, (i) => l({ faixa_resposta: String(i), ordem: "resposta" }))} unidade="conversa(s)" />
        </Cartao>
      </div>

      <Cartao
        titulo="Atendentes"
        acao={
          <Link to={`/atendentes?${params}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Ranking completo <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        <TabelaAtendentes linhas={d.porAtendente.slice(0, 8)} link={(id) => l({ atendente: id })} />
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Volume × velocidade dos atendentes" dica={GLOSSARIO.dispersao}>
          <Dispersao
            rotuloX="Atendimentos"
            rotuloY="Resposta média"
            pontos={d.porAtendente
              .filter((a) => a.chave && a.tempoMedioResposta !== null)
              .map((a) => ({ id: a.chave!, nome: a.rotulo, x: a.total, y: a.tempoMedioResposta!, link: l({ atendente: a.chave! }), detalhe: `${porcento(a.ate30, a.comTempo)} em até 30 min · clique para ver` }))}
          />
        </Cartao>
        <Cartao titulo="Quem mais demora para assumir" dica={GLOSSARIO.rankingTempo}>
          <ListaBarras
            formato={duracao}
            total={1}
            max={10}
            vazio="Sem tempos medidos no período"
            linhas={[...atendentesComTempo]
              .sort((a, b) => b.tempoAteHumano! - a.tempoAteHumano!)
              .map((a) => ({
                chave: a.chave!,
                rotulo: a.rotulo,
                valor: a.tempoAteHumano!,
                sub: `${numero(a.total)} atendimento(s) · ${porcento(a.ate30, a.comTempo)} em até 30 min`,
                cor: a.tempoAteHumano! > 1800 ? "var(--bad)" : "var(--accent)",
                link: l({ atendente: a.chave!, situacao: "humano", ordem: "humano" }),
              }))}
          />
        </Cartao>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Por origem" dica={GLOSSARIO.origem}>
          <Rosca fatias={fatias(d.porOrigem, "origem", "nenhuma")} centro={numero(r.total)} centroSub="atendimentos" />
        </Cartao>
        <Cartao titulo="Por departamento" dica={GLOSSARIO.departamento}>
          <Rosca fatias={fatias(d.porDepartamento, "departamento", "nenhum")} centro={numero(r.total)} centroSub="atendimentos" />
        </Cartao>
        <Cartao titulo="Origem em detalhe" dica="Cada origem com a % atendida em até 30 min e o tempo médio do robô até o humano.">
          <ListaBarras linhas={linhas(d.porOrigem, "origem", true)} total={r.total} />
        </Cartao>
        <Cartao titulo="Departamento em detalhe" dica="Cada departamento com a % atendida em até 30 min e o tempo médio do robô até o humano.">
          <ListaBarras linhas={linhas(d.porDepartamento, "departamento", true)} total={r.total} />
        </Cartao>
        <Cartao titulo="Mapa das cidades" dica={GLOSSARIO.cidades}>
          <MapaRetangulos blocos={d.porCidade.slice(0, 30).map((c) => ({ name: c.rotulo, size: c.total, link: c.chave ? l({ cidade: c.chave }) : undefined }))} />
        </Cartao>
        <Cartao titulo="Por cidade" dica={GLOSSARIO.cidade}>
          <ListaBarras linhas={linhasTexto(d.porCidade, "cidade")} total={r.total} />
        </Cartao>
        <Cartao titulo="Por canal de entrada" dica={GLOSSARIO.canal}>
          <ListaBarras linhas={linhasTexto(d.porCanal, "canal")} total={r.total} />
        </Cartao>
        <Cartao titulo="Anúncios por plataforma" dica={GLOSSARIO.anuncio}>
          <ListaBarras linhas={linhasTexto(d.porAnuncio, "anuncio").map((x) => ({ ...x, link: l({ anuncio: x.chave === "_vazio" ? "-" : x.chave }) }))} total={r.total} />
        </Cartao>
        <Cartao titulo="Interesse do cliente" dica={GLOSSARIO.interesse}>
          <ListaBarras linhas={linhasTexto(d.porInteresse, "interesse")} total={r.total} />
        </Cartao>
        <Cartao titulo="Etiquetas" dica={GLOSSARIO.etiquetas}>
          <ListaBarras
            vazio="Nenhuma etiqueta no período"
            total={r.total}
            linhas={d.porEtiqueta.map((e) => ({ chave: e.chave, rotulo: e.rotulo, valor: e.total, ponto: e.cor, link: l({ etiqueta: e.chave }) }))}
          />
        </Cartao>
        <Cartao titulo="Por fonte do contato" dica={GLOSSARIO.fonte}>
          <ListaBarras linhas={linhasTexto(d.porFonte, "fonte")} total={r.total} />
        </Cartao>
        <Cartao titulo="Quem escreve nas conversas" dica={GLOSSARIO.mensagens}>
          <Rosca
            centro={numero(d.mensagens.cliente + d.mensagens.bot + d.mensagens.humano + d.mensagens.api)}
            centroSub="mensagens"
            fatias={[
              { chave: "cliente", rotulo: "Cliente", valor: d.mensagens.cliente, cor: PALETA[0]! },
              { chave: "humano", rotulo: "Atendentes", valor: d.mensagens.humano, cor: PALETA[2]! },
              { chave: "bot", rotulo: "Robô", valor: d.mensagens.bot, cor: COR_OUTROS },
              { chave: "api", rotulo: "Integração (API)", valor: d.mensagens.api, cor: PALETA[3]! },
            ]}
          />
        </Cartao>
      </div>

      <Cartao titulo="Quando os clientes chegam" dica={GLOSSARIO.horarios} acao={<span className="text-xs text-muted">clique num quadrinho para ver quem chegou</span>}>
        <MapaHorarios horarios={d.horarios} link={(dia, hora) => l({ dia_semana: String(dia), hora: String(hora) })} />
      </Cartao>
      <Cartao titulo="Clientes chegando por hora do dia" dica={GLOSSARIO.porHora}>
        <Colunas
          altura={180}
          intervalo="preserveStartEnd"
          unidade="cliente(s)"
          dados={Array.from({ length: 24 }, (_, h) => ({
            rotulo: `${h}h`,
            detalhe: `Entre ${h}h e ${h + 1}h`,
            valor: d.horarios.filter((x) => x.hora === h).reduce((s, x) => s + x.total, 0),
            link: l({ hora: String(h) }),
          }))}
        />
      </Cartao>
    </div>
  );
}

/** Faixas de tempo: as acima de 30 min em vermelho (estado ruim, explicado na legenda) */
function faixas(lista: { faixa: number; total: number }[], link: (i: number) => string) {
  return FAIXAS.map((rotulo, i) => ({
    rotulo,
    valor: lista.find((f) => f.faixa === i)?.total ?? 0,
    cor: i >= 3 ? "var(--bad)" : "var(--accent)",
    link: link(i),
  }));
}
function LegendaFaixas() {
  return (
    <span className="flex items-center gap-3 text-[11px] text-muted">
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full bg-accent" /> até 30 min
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full bg-bad" /> acima de 30 min
      </span>
    </span>
  );
}

/** Cartão de número: explicação no ⓘ, mini-linha do período e clique para a lista */
export function Indicador({
  rotulo,
  valor,
  sub,
  tom,
  dica,
  link,
  serie,
  corSerie,
}: {
  rotulo: string;
  valor: ReactNode;
  sub?: string;
  tom?: "bom" | "ruim";
  dica?: string;
  link?: string;
  serie?: number[];
  corSerie?: string;
}) {
  return (
    <div className={cx("group relative flex flex-col rounded-xl border border-line bg-surface px-4 py-3 transition-colors", link && "hover:border-accent")}>
      {link && <Link to={link} className="absolute inset-0 z-0 rounded-xl" aria-label={`${rotulo}: ver a lista`} />}
      <p className="flex items-center gap-1 pr-4 text-xs text-muted">
        <span>{rotulo}</span>
        {dica && <Dica texto={dica} className="relative z-10" />}
      </p>
      {link && <ArrowUpRight className="absolute right-2.5 top-2.5 size-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />}
      <p className={cx("mt-0.5 text-2xl font-semibold tabular tracking-tight", tom === "ruim" && "text-bad", tom === "bom" && "text-good")}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      {serie && serie.some((v) => v > 0) && (
        <div className="mt-auto pt-1.5">
          <MiniLinha valores={serie} cor={corSerie} />
        </div>
      )}
    </div>
  );
}

function Th({ children, dica, esquerda }: { children: ReactNode; dica?: string; esquerda?: boolean }) {
  return (
    <th className={cx("px-3 py-2 font-medium", !esquerda && "text-right")}>
      <span className={cx("inline-flex items-center gap-1", !esquerda && "justify-end")}>
        {children}
        {dica && <Dica texto={dica} />}
      </span>
    </th>
  );
}

export function TabelaAtendentes({ linhas, link, transferencias }: { linhas: Grupo[]; link: (id: string) => string; transferencias?: Painel["transferencias"] }) {
  const { params } = useFiltros();
  if (!linhas.length) return <p className="py-6 text-center text-sm text-muted">Nenhum atendente no período</p>;
  const tr = new Map((transferencias ?? []).map((t) => [t.chave, t]));
  const recorte = (id: string | null, extra: Record<string, string>) => (id ? linkLista(params, { atendente: id, ...extra }) : undefined);
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-4 py-2 font-medium">Atendente</th>
            <Th dica="Atendimentos em que esta pessoa foi o atendente principal.">Atendimentos</Th>
            <Th dica={GLOSSARIO.roboHumano}>Robô → humano</Th>
            <Th dica={GLOSSARIO.respostaMedia}>Resposta média</Th>
            <Th dica={GLOSSARIO.ate30}>Até 30 min</Th>
            <Th dica={GLOSSARIO.esperas30}>Esperas &gt; 30</Th>
            <Th dica={GLOSSARIO.semResposta}>Sem resposta</Th>
            {transferencias && <Th dica={GLOSSARIO.transferencias}>Transferiu / recebeu</Th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((a) => {
            const t = a.chave ? tr.get(a.chave) : undefined;
            return (
              <tr key={a.chave ?? "sem"} className="border-b border-line/60 last:border-0 hover:bg-surface-2">
                <td className="px-4 py-2">
                  {a.chave ? (
                    <Link to={link(a.chave)} className="font-medium text-ink hover:underline">
                      {a.rotulo}
                    </Link>
                  ) : (
                    <span className="text-muted">{a.rotulo}</span>
                  )}
                  {a.timeNome && <span className="ml-2 text-xs text-muted">{a.timeNome}</span>}
                </td>
                <Celula link={a.chave ? link(a.chave) : undefined}>{numero(a.total)}</Celula>
                <Celula link={recorte(a.chave, { situacao: "humano", ordem: "humano" })} ruim={(a.tempoAteHumano ?? 0) > 1800}>
                  {duracao(a.tempoAteHumano)}
                </Celula>
                <Celula link={recorte(a.chave, { situacao: "respondido", ordem: "resposta" })} ruim={(a.tempoMedioResposta ?? 0) > 1800}>
                  {duracao(a.tempoMedioResposta)}
                </Celula>
                <Celula link={recorte(a.chave, { situacao: "acima30", ordem: "humano" })}>{porcento(a.ate30, a.comTempo)}</Celula>
                <Celula link={a.esperas30 ? recorte(a.chave, { situacao: "esperou30", ordem: "espera" }) : undefined} ruim={a.esperas30 > 0}>
                  {numero(a.esperas30)}
                </Celula>
                <Celula link={a.semResposta ? recorte(a.chave, { situacao: "sem_resposta", ordem: "espera" }) : undefined} ruim={a.semResposta > 0}>
                  {numero(a.semResposta)}
                </Celula>
                {transferencias && (
                  <Celula link={recorte(a.chave, { situacao: "transferido" })}>
                    {numero(t?.feitas ?? 0)} / {numero(t?.recebidas ?? 0)}
                  </Celula>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Celula({ children, link, ruim }: { children: ReactNode; link?: string; ruim?: boolean }) {
  return (
    <td className={cx("px-3 py-2 text-right tabular", ruim && "text-bad")}>
      {link ? (
        <Link to={link} className="rounded px-1 hover:bg-surface hover:underline" title="Ver os atendimentos">
          {children}
        </Link>
      ) : (
        children
      )}
    </td>
  );
}

function SeriePorDia({
  d,
  inicio,
  fim,
  chatbots,
  linkDia,
}: {
  d: Painel;
  inicio?: string;
  fim?: string;
  chatbots: { id: string; nome: string; cor: string }[];
  linkDia: (iso: string) => string;
}) {
  const nav = useNavigate();
  const dados = useMemo(() => {
    const dias = inicio && fim ? diasEntre(inicio, fim) : [...new Set(d.serie.map((s) => s.dia))].sort();
    return dias.map((dia) => {
      const linha: Record<string, number | string> = { dia: diaCurto(dia), iso: dia };
      for (const c of chatbots) linha[c.id] = d.serie.filter((s) => s.dia === dia && s.chatbotId === c.id).reduce((s, x) => s + x.total, 0);
      return linha;
    });
  }, [d, inicio, fim, chatbots]);
  const usados = chatbots.filter((c) => d.serie.some((s) => s.chatbotId === c.id));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          margin={{ left: -18, right: 8, top: 8 }}
          onClick={(e: { activePayload?: { payload: { iso: string } }[] }) => e?.activePayload?.[0] && nav(linkDia(e.activePayload[0].payload.iso))}
          className="cursor-pointer"
        >
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="dia" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={estiloDica} />
          {usados.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {usados.map((c, i) => (
            <Bar key={c.id} dataKey={c.id} name={c.nome} stackId="a" fill={c.cor} radius={i === usados.length - 1 ? [3, 3, 0, 0] : 0} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function MapaHorarios({ horarios, link }: { horarios: Painel["horarios"]; link: (dia: number, hora: number) => string }) {
  const nav = useNavigate();
  const max = Math.max(1, ...horarios.map((h) => h.total));
  const valor = (dia: number, hora: number) => horarios.find((h) => h.diaSemana === dia && h.hora === hora)?.total ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-[3px] text-[11px]">
        <colgroup>
          <col className="w-10" />
        </colgroup>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="font-normal text-muted tabular">
                {h % 3 === 0 ? `${h}h` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 0].map((dia) => (
            <tr key={dia}>
              <th className="pr-2 text-right font-normal text-muted">{DIAS[dia]}</th>
              {Array.from({ length: 24 }, (_, h) => {
                const v = valor(dia, h);
                return (
                  <td
                    key={h}
                    title={`${DIAS_SEMANA[dia]}, ${h}h às ${h + 1}h: ${v} cliente(s)${v ? " · clique para ver" : ""}`}
                    onClick={() => v && nav(link(dia, h))}
                    className={cx("h-6 rounded-[3px]", v > 0 && "cursor-pointer hover:outline hover:outline-2 hover:outline-ink")}
                    style={{ background: v ? `color-mix(in oklab, var(--accent) ${15 + (v / max) * 85}%, var(--surface-2))` : "var(--surface-2)" }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-muted">
        menos
        {[15, 40, 65, 100].map((p) => (
          <span key={p} className="size-3 rounded-[3px]" style={{ background: `color-mix(in oklab, var(--accent) ${p}%, var(--surface-2))` }} />
        ))}
        mais
      </div>
    </div>
  );
}
