import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, qs, type Grupo, type Painel } from "../api";
import { ListaBarras } from "../components/Barras";
import { BarraFiltros } from "../components/Filtros";
import { Titulo } from "../components/Layout";
import { Alerta, Cartao, Carregando, cx, Vazio } from "../components/ui";
import { useAuth } from "../auth";
import { useChatbots, useFiltros } from "../hooks";
import { diaCurto, diasEntre, duracao, numero, porcento } from "../lib/formato";

export function usePainel() {
  const { consulta } = useFiltros();
  const { empresa } = useAuth();
  const q = qs(consulta);
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
      <Titulo titulo="Painel" descricao="Leads, tempos de atendimento e de onde vêm os clientes. Tempos contam só o horário de atendimento de cada chatbot." />
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

function Conteudo({ d }: { d: Painel }) {
  const { filtros, params } = useFiltros();
  const chatbots = useChatbots();
  const r = d.resumo;
  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    p.delete("pagina");
    return `/atendimentos?${p}`;
  };
  const linhas = (g: Grupo[], param?: string, comCor = false) =>
    g.map((x) => ({
      chave: x.chave ?? "nenhum",
      rotulo: x.rotulo,
      valor: x.total,
      sub: x.humano ? `${porcento(x.ate30, x.comTempo)} em até 30 min · ${duracao(x.tempoAteHumano)}` : "só robô",
      ...(comCor ? { cor: x.cor ?? "#b4b8c5" } : {}),
      link: param && x.chave ? link({ [param]: x.chave }) : undefined,
    }));

  return (
    <div className="grid gap-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Atendimentos" valor={numero(r.total)} sub={`${numero(r.leadsNovos)} leads novos`} />
        <Indicador rotulo="Foram para humano" valor={numero(r.humano)} sub={`${porcento(r.humano, r.total)} do total`} />
        <Indicador rotulo="Sem atendimento humano" valor={numero(r.semHumano)} sub={`${porcento(r.semHumano, r.humano)} de quem foi para a fila`} tom={r.semHumano ? "ruim" : undefined} />
        <Indicador rotulo="Humano em até 30 min" valor={porcento(r.ate30, r.comTempo)} sub={`${numero(r.ate30)} de ${numero(r.comTempo)} atendidos`} tom="bom" />
        <Indicador rotulo="Robô → humano (média)" valor={duracao(r.tempoAteHumano)} sub="da transferência à 1ª resposta" />
        <Indicador rotulo="1ª resposta (média)" valor={duracao(r.tempoPrimeiraResposta)} sub="da 1ª mensagem do cliente" />
        <Indicador rotulo="Resposta do atendente (média)" valor={duracao(r.tempoMedioResposta)} sub={`${numero(r.respostas)} respostas medidas`} />
        <Indicador rotulo="Esperas acima de 30 min" valor={numero(r.esperas30)} sub={`${numero(r.semResposta)} mensagens sem resposta`} tom={r.esperas30 ? "ruim" : undefined} />
      </section>

      <Cartao titulo="Atendimentos por dia">
        <SeriePorDia d={d} inicio={filtros.inicio} fim={filtros.fim} chatbots={chatbots.data ?? []} />
      </Cartao>

      <Cartao
        titulo="Atendentes"
        acao={
          <Link to={`/atendentes?${params}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Ranking completo <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        <TabelaAtendentes linhas={d.porAtendente.slice(0, 8)} link={(id) => link({ atendente: id })} />
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Por departamento">
          <ListaBarras linhas={linhas(d.porDepartamento, "departamento", true)} total={r.total} />
        </Cartao>
        <Cartao titulo="Por origem">
          <ListaBarras linhas={linhas(d.porOrigem, "origem", true)} total={r.total} />
        </Cartao>
        <Cartao titulo="Por cidade">
          <ListaBarras linhas={linhas(d.porCidade)} total={r.total} />
        </Cartao>
        <Cartao titulo="Por canal de entrada">
          <ListaBarras linhas={linhas(d.porCanal)} total={r.total} />
        </Cartao>
        <Cartao titulo="Anúncios por plataforma">
          <ListaBarras linhas={linhas(d.porAnuncio)} total={r.total} />
        </Cartao>
        <Cartao titulo="Por fonte do contato">
          <ListaBarras linhas={linhas(d.porFonte)} total={r.total} />
        </Cartao>
      </div>

      <Cartao titulo="Quando os clientes chegam" acao={<span className="text-xs text-muted">1ª mensagem do cliente, por dia da semana e hora</span>}>
        <MapaHorarios horarios={d.horarios} />
      </Cartao>
    </div>
  );
}

export function Indicador({ rotulo, valor, sub, tom }: { rotulo: string; valor: ReactNode; sub?: string; tom?: "bom" | "ruim" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{rotulo}</p>
      <p className={cx("mt-0.5 text-2xl font-semibold tabular tracking-tight", tom === "ruim" && "text-bad", tom === "bom" && "text-good")}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function TabelaAtendentes({ linhas, link, transferencias }: { linhas: Grupo[]; link: (id: string) => string; transferencias?: Painel["transferencias"] }) {
  if (!linhas.length) return <p className="py-6 text-center text-sm text-muted">Nenhum atendente no período</p>;
  const tr = new Map((transferencias ?? []).map((t) => [t.chave, t]));
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-4 py-2 font-medium">Atendente</th>
            <th className="px-3 py-2 text-right font-medium">Atendimentos</th>
            <th className="px-3 py-2 text-right font-medium">Robô → humano</th>
            <th className="px-3 py-2 text-right font-medium">Resposta média</th>
            <th className="px-3 py-2 text-right font-medium">Até 30 min</th>
            <th className="px-3 py-2 text-right font-medium">Esperas &gt; 30</th>
            <th className="px-3 py-2 text-right font-medium">Sem resposta</th>
            {transferencias && <th className="px-4 py-2 text-right font-medium">Transferiu / recebeu</th>}
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
                <td className="px-3 py-2 text-right tabular">{numero(a.total)}</td>
                <td className="px-3 py-2 text-right tabular">{duracao(a.tempoAteHumano)}</td>
                <td className="px-3 py-2 text-right tabular">{duracao(a.tempoMedioResposta)}</td>
                <td className="px-3 py-2 text-right tabular">{porcento(a.ate30, a.comTempo)}</td>
                <td className={cx("px-3 py-2 text-right tabular", a.esperas30 > 0 && "text-bad")}>{numero(a.esperas30)}</td>
                <td className="px-3 py-2 text-right tabular">{numero(a.semResposta)}</td>
                {transferencias && (
                  <td className="px-4 py-2 text-right tabular">
                    {numero(t?.feitas ?? 0)} / {numero(t?.recebidas ?? 0)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SeriePorDia({ d, inicio, fim, chatbots }: { d: Painel; inicio?: string; fim?: string; chatbots: { id: string; nome: string; cor: string }[] }) {
  const dados = useMemo(() => {
    const dias = inicio && fim ? diasEntre(inicio, fim) : [...new Set(d.serie.map((s) => s.dia))].sort();
    return dias.map((dia) => {
      const linha: Record<string, number | string> = { dia: diaCurto(dia) };
      for (const c of chatbots) linha[c.id] = d.serie.filter((s) => s.dia === dia && s.chatbotId === c.id).reduce((s, x) => s + x.total, 0);
      return linha;
    });
  }, [d, inicio, fim, chatbots]);
  const usados = chatbots.filter((c) => d.serie.some((s) => s.chatbotId === c.id));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ left: -18, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="dia" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
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
function MapaHorarios({ horarios }: { horarios: Painel["horarios"] }) {
  const max = Math.max(1, ...horarios.map((h) => h.total));
  const valor = (dia: number, hora: number) => horarios.find((h) => h.diaSemana === dia && h.hora === hora)?.total ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-[3px] text-[11px]">
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
                    title={`${DIAS[dia]} ${h}h: ${v} atendimento(s)`}
                    className="h-6 rounded-[3px]"
                    style={{ background: v ? `color-mix(in oklab, var(--accent) ${15 + (v / max) * 85}%, var(--surface-2))` : "var(--surface-2)" }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
