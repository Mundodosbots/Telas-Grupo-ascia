import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { duracao, numero, pct } from "../lib/formato";
import { cx, Dica, Ponto } from "./ui";

/** Cinza do "Outros" (último slot da paleta categórica) */
export const COR_OUTROS = "#898781";
export const estiloDica = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, color: "var(--ink)" };

/** Caixinha do tooltip dos gráficos: título + linhas "● nome  valor" */
function CaixaTooltip({ titulo, linhas, rodape }: { titulo?: ReactNode; linhas: { cor?: string; nome: string; valor: string }[]; rodape?: string }) {
  return (
    <div className="min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {titulo && <p className="mb-1 font-medium text-ink">{titulo}</p>}
      {linhas.map((l) => (
        <p key={l.nome} className="flex items-center gap-2 text-ink-2">
          {l.cor && <Ponto cor={l.cor} className="size-2" />}
          <span className="flex-1">{l.nome}</span>
          <span className="font-medium text-ink tabular">{l.valor}</span>
        </p>
      ))}
      {rodape && <p className="mt-1 text-[11px] text-muted">{rodape}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rosca (participação)                                                 */
/* ------------------------------------------------------------------ */

export type Fatia = { chave: string; rotulo: string; valor: number; cor: string; link?: string; dica?: string };

/** Rosca com legenda clicável ao lado. Mais de `max` fatias: o resto vira "Outros". */
export function Rosca({ fatias, centro, centroSub, max = 7, vazio = "Sem dados no período" }: { fatias: Fatia[]; centro?: string; centroSub?: string; max?: number; vazio?: string }) {
  const nav = useNavigate();
  const validas = fatias.filter((f) => f.valor > 0);
  if (!validas.length) return <p className="py-6 text-center text-sm text-muted">{vazio}</p>;
  const visiveis = validas.length > max ? validas.slice(0, max - 1) : validas;
  const resto = validas.slice(visiveis.length);
  const dados = resto.length ? [...visiveis, { chave: "_outros", rotulo: `Outros (${resto.length})`, valor: resto.reduce((s, f) => s + f.valor, 0), cor: COR_OUTROS }] : visiveis;
  const total = dados.reduce((s, f) => s + f.valor, 0);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="relative mx-auto size-40 shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="rotulo"
              innerRadius="64%"
              outerRadius="100%"
              stroke="var(--surface)"
              strokeWidth={2}
              cornerRadius={3}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              onClick={(d: { link?: string }) => d?.link && nav(d.link)}
            >
              {dados.map((f) => (
                <Cell key={f.chave} fill={f.cor} className={(f as Fatia).link ? "cursor-pointer outline-none" : "outline-none"} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const f = payload?.[0]?.payload as Fatia | undefined;
                if (!active || !f) return null;
                return <CaixaTooltip linhas={[{ cor: f.cor, nome: f.rotulo, valor: `${numero(f.valor)} (${pct(f.valor, total)})` }]} rodape={f.link ? "Clique para ver a lista" : undefined} />;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {centro && (
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <p className="text-xl font-semibold text-ink tabular">{centro}</p>
            {centroSub && <p className="text-[11px] text-muted">{centroSub}</p>}
          </div>
        )}
      </div>
      <ul className="grid min-w-44 flex-1 gap-0.5">
        {dados.map((f) => (
          <li key={f.chave}>
            <button
              type="button"
              disabled={!(f as Fatia).link}
              onClick={() => (f as Fatia).link && nav((f as Fatia).link!)}
              className={cx("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px]", (f as Fatia).link && "hover:bg-surface-2 cursor-pointer")}
            >
              <Ponto cor={f.cor} />
              <span className="min-w-0 flex-1 truncate text-ink">{f.rotulo}</span>
              <span className="font-medium text-ink tabular">{numero(f.valor)}</span>
              <span className="w-9 text-right text-[11px] text-muted tabular">{pct(f.valor, total)}</span>
            </button>
            {(f as Fatia).dica && <span className="sr-only">{(f as Fatia).dica}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Funil                                                                */
/* ------------------------------------------------------------------ */

/** perda.valor: quando a queda não é só "anterior − atual" (ex.: parte não tem tempo medido); extra: observação em cinza */
export type Etapa = { rotulo: string; valor: number; dica?: string; link?: string; perda?: { texto: string; link?: string; valor?: number; extra?: string } };

/** Funil horizontal: cada etapa é uma barra centralizada, com a queda entre elas */
export function Funil({ etapas }: { etapas: Etapa[] }) {
  const nav = useNavigate();
  const topo = Math.max(1, etapas[0]?.valor ?? 1);
  return (
    <ol className="grid gap-1">
      {etapas.map((e, i) => {
        const largura = Math.max(6, (e.valor / topo) * 100);
        const anterior = etapas[i - 1];
        return (
          <li key={e.rotulo} className="grid gap-1">
            {anterior && e.perda && (e.perda.valor ?? anterior.valor - e.valor) > 0 && (
              <button
                type="button"
                disabled={!e.perda.link}
                onClick={() => e.perda?.link && nav(e.perda.link)}
                className={cx("justify-self-center rounded px-1.5 text-[11px] text-bad", e.perda.link && "hover:underline cursor-pointer")}
              >
                ↓ {numero(e.perda.valor ?? anterior.valor - e.valor)} {e.perda.texto} ({pct(e.perda.valor ?? anterior.valor - e.valor, anterior.valor)})
                {e.perda.extra && <span className="text-muted"> · {e.perda.extra}</span>}
              </button>
            )}
            <div className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3">
              <span className="flex items-center gap-1 text-[13px] text-ink">
                <span className="truncate">{e.rotulo}</span>
                {e.dica && <Dica texto={e.dica} />}
              </span>
              <button
                type="button"
                disabled={!e.link}
                onClick={() => e.link && nav(e.link)}
                title={e.link ? "Clique para ver a lista" : undefined}
                className={cx("group flex h-9 items-center justify-center", e.link && "cursor-pointer")}
              >
                <span
                  className="flex h-full items-center justify-center rounded-md text-sm font-semibold text-white tabular transition-[filter] group-hover:brightness-110"
                  style={{ width: `${largura}%`, background: "var(--accent)", minWidth: "3.5rem" }}
                >
                  {numero(e.valor)}
                  {i > 0 && <span className="ml-1.5 text-[11px] font-normal opacity-85">{pct(e.valor, topo)}</span>}
                </span>
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Medidor (meia-lua)                                                   */
/* ------------------------------------------------------------------ */

/** Meia-lua de 0 a 100%. Cor por faixa (status) e sempre com o texto do estado ao lado. */
export function Medidor({ valor, sub, link }: { valor: number | null; sub?: string; link?: string }) {
  const nav = useNavigate();
  const v = valor === null ? null : Math.max(0, Math.min(1, valor));
  const estado = v === null ? null : v >= 0.8 ? { cor: "var(--good)", texto: "Bom" } : v >= 0.5 ? { cor: "var(--warn)", texto: "Atenção" } : { cor: "var(--bad)", texto: "Ruim" };
  // Arco de 180° (raio 80, centro 100,100)
  const ponto = (f: number) => {
    const a = Math.PI * (1 - f);
    return [100 + 80 * Math.cos(a), 100 - 80 * Math.sin(a)] as const;
  };
  const [x, y] = ponto(v ?? 0);
  return (
    <button type="button" disabled={!link} onClick={() => link && nav(link)} className={cx("grid w-full justify-items-center", link && "cursor-pointer")}>
      <svg viewBox="0 0 200 112" className="w-full max-w-60" role="img" aria-label={v === null ? "Sem dados" : `${Math.round(v * 100)}%`}>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--surface-2)" strokeWidth="16" strokeLinecap="round" />
        {v !== null && v > 0 && <path d={`M 20 100 A 80 80 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} fill="none" stroke={estado!.cor} strokeWidth="16" strokeLinecap="round" />}
        {[0.5, 0.8].map((f) => {
          const [a, b] = ponto(f);
          const [c, d] = [100 + 62 * Math.cos(Math.PI * (1 - f)), 100 - 62 * Math.sin(Math.PI * (1 - f))];
          return <line key={f} x1={a.toFixed(1)} y1={b.toFixed(1)} x2={c.toFixed(1)} y2={d.toFixed(1)} stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="2 2" />;
        })}
        <text x="100" y="88" textAnchor="middle" fontSize="30" fontWeight="600" fill="var(--ink)" className="tabular">
          {v === null ? "—" : `${Math.round(v * 100)}%`}
        </text>
      </svg>
      {estado && (
        <span className="-mt-1 inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: estado.cor }}>
          <Ponto cor={estado.cor} className="size-2" /> {estado.texto}
        </span>
      )}
      {sub && <span className="mt-0.5 text-xs text-muted">{sub}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Colunas (histograma, por hora…)                                      */
/* ------------------------------------------------------------------ */

export type Coluna = { rotulo: string; valor: number; cor?: string; link?: string; detalhe?: string };

export function Colunas({ dados, altura = 200, unidade = "atendimento(s)", intervalo = 0 }: { dados: Coluna[]; altura?: number; unidade?: string; intervalo?: number | "preserveStartEnd" }) {
  const nav = useNavigate();
  if (!dados.some((d) => d.valor > 0)) return <p className="py-6 text-center text-sm text-muted">Sem dados no período</p>;
  return (
    <div style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ left: -18, right: 4, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={false} interval={intervalo} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              const c = payload?.[0]?.payload as Coluna | undefined;
              if (!active || !c) return null;
              return <CaixaTooltip titulo={c.detalhe ?? c.rotulo} linhas={[{ cor: c.cor ?? "var(--accent)", nome: unidade, valor: numero(c.valor) }]} rodape={c.link ? "Clique para ver a lista" : undefined} />;
            }}
          />
          <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={44} onClick={(d: { link?: string }) => d?.link && nav(d.link)} className="cursor-pointer">
            {dados.map((d) => (
              <Cell key={d.rotulo} fill={d.cor ?? "var(--accent)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Evolução por dia                                                     */
/* ------------------------------------------------------------------ */

export type PontoDia = { iso: string; dia: string; [serie: string]: number | string | null };

/** Áreas empilhadas por dia (ex.: atendidos × sem humano). Clique num dia abre a lista daquele dia. */
export function AreasPorDia({ dados, series, linkDia }: { dados: PontoDia[]; series: { chave: string; nome: string; cor: string }[]; linkDia: (iso: string) => string }) {
  const nav = useNavigate();
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={dados}
          margin={{ left: -18, right: 8, top: 8 }}
          onClick={(e: { activePayload?: { payload: PontoDia }[] }) => e?.activePayload?.[0] && nav(linkDia(e.activePayload[0].payload.iso))}
          className="cursor-pointer"
        >
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="dia" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <CaixaTooltip titulo={label} linhas={series.map((s) => ({ cor: s.cor, nome: s.nome, valor: numero(Number(payload[0]!.payload[s.chave] ?? 0)) }))} rodape="Clique para ver o dia" />
              ) : null
            }
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Area key={s.chave} type="linear" dataKey={s.chave} name={s.nome} stackId="1" stroke={s.cor} strokeWidth={2} fill={s.cor} fillOpacity={0.18} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Linha de um tempo (em segundos) por dia, com a marca de 30 min */
export function LinhaTempo({ dados, chave, cor = "var(--accent)", linkDia }: { dados: PontoDia[]; chave: string; cor?: string; linkDia: (iso: string) => string }) {
  const nav = useNavigate();
  if (!dados.some((d) => d[chave] !== null && d[chave] !== undefined)) return <p className="py-6 text-center text-sm text-muted">Sem tempos medidos no período</p>;
  const minutos = dados.map((d) => ({ ...d, min: d[chave] === null ? null : Math.round(Number(d[chave]) / 60) }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={minutos}
          margin={{ left: -12, right: 8, top: 8 }}
          onClick={(e: { activePayload?: { payload: PontoDia }[] }) => e?.activePayload?.[0] && nav(linkDia(e.activePayload[0].payload.iso))}
          className="cursor-pointer"
        >
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="dia" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} unit=" min" width={64} />
          <ReferenceLine y={30} stroke="var(--bad)" strokeDasharray="4 4" label={{ value: "30 min", position: "insideTopRight", fill: "var(--bad)", fontSize: 11 }} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <CaixaTooltip titulo={label} linhas={[{ cor, nome: "Tempo médio", valor: duracao(payload[0]!.payload[chave] as number | null) }]} rodape="Clique para ver o dia" />
              ) : null
            }
          />
          <Line type="linear" dataKey="min" stroke={cor} strokeWidth={2} connectNulls dot={{ r: 3, fill: cor, stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dispersão (atendentes)                                               */
/* ------------------------------------------------------------------ */

export type PontoDispersao = { id: string; nome: string; x: number; y: number; link?: string; detalhe?: string };

export function Dispersao({ pontos, rotuloX, rotuloY }: { pontos: PontoDispersao[]; rotuloX: string; rotuloY: string }) {
  const nav = useNavigate();
  if (!pontos.length) return <p className="py-6 text-center text-sm text-muted">Sem atendentes com tempo medido no período</p>;
  const dados = pontos.map((p) => ({ ...p, min: Math.round(p.y / 60) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ left: -6, right: 12, top: 8, bottom: 14 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="x" name={rotuloX} tickLine={false} axisLine={false} allowDecimals={false} label={{ value: rotuloX, position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 11 }} />
          <YAxis type="number" dataKey="min" name={rotuloY} unit=" min" tickLine={false} axisLine={false} width={60} />
          <ZAxis range={[90, 90]} />
          <ReferenceLine y={30} stroke="var(--bad)" strokeDasharray="4 4" label={{ value: "30 min", position: "insideTopRight", fill: "var(--bad)", fontSize: 11 }} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as PontoDispersao | undefined;
              if (!active || !p) return null;
              return (
                <CaixaTooltip
                  titulo={p.nome}
                  linhas={[
                    { nome: rotuloX, valor: numero(p.x) },
                    { nome: rotuloY, valor: duracao(p.y) },
                  ]}
                  rodape={p.detalhe ?? "Clique para ver os atendimentos"}
                />
              );
            }}
          />
          <Scatter data={dados} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} onClick={(p: { link?: string }) => p?.link && nav(p.link)} className="cursor-pointer" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mapa de retângulos (cidades)                                         */
/* ------------------------------------------------------------------ */

export type Bloco = { name: string; size: number; link?: string };

export function MapaRetangulos({ blocos, altura = 240 }: { blocos: Bloco[]; altura?: number }) {
  const nav = useNavigate();
  const validos = blocos.filter((b) => b.size > 0);
  if (!validos.length) return <p className="py-6 text-center text-sm text-muted">Sem dados no período</p>;
  const total = validos.reduce((s, b) => s + b.size, 0);
  const maior = Math.max(...validos.map((b) => b.size));
  return (
    <div style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={validos}
          dataKey="size"
          isAnimationActive={false}
          onClick={(n) => { const link = (n as unknown as { link?: string }).link; if (link) nav(link); }}
          content={<Retangulo maior={maior} total={total} />}
        >
          <Tooltip
            content={({ active, payload }) => {
              const b = payload?.[0]?.payload as Bloco | undefined;
              if (!active || !b) return null;
              return <CaixaTooltip linhas={[{ cor: "var(--accent)", nome: b.name, valor: `${numero(b.size)} (${pct(b.size, total)})` }]} rodape={b.link ? "Clique para ver a lista" : undefined} />;
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}

function Retangulo(props: { x?: number; y?: number; width?: number; height?: number; name?: string; size?: number; depth?: number; maior: number; total: number; link?: string }) {
  const { x = 0, y = 0, width = 0, height = 0, name, size = 0, depth, maior, total, link } = props;
  if (depth !== 1) return null;
  const forca = 30 + (size / maior) * 70;
  const escuro = forca > 55;
  return (
    <g className={link ? "cursor-pointer" : undefined}>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={`color-mix(in oklab, var(--accent) ${forca}%, var(--surface))`} stroke="var(--surface)" strokeWidth={2} />
      {width > 56 && height > 30 && (
        <>
          <text x={x + 8} y={y + 18} fontSize={12} fontWeight={500} fill={escuro ? "#fff" : "var(--ink)"}>
            {name && name.length * 7 > width - 12 ? name.slice(0, Math.max(3, Math.floor((width - 12) / 7))) + "…" : name}
          </text>
          {height > 44 && (
            <text x={x + 8} y={y + 34} fontSize={11} fill={escuro ? "rgba(255,255,255,.85)" : "var(--ink-2)"}>
              {numero(size)} · {pct(size, total)}
            </text>
          )}
        </>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Mini-linha dos indicadores                                           */
/* ------------------------------------------------------------------ */

export function MiniLinha({ valores, cor = "var(--accent)" }: { valores: number[]; cor?: string }) {
  if (valores.length < 2) return null;
  const max = Math.max(...valores, 1);
  const passo = 100 / (valores.length - 1);
  const pts = valores.map((v, i) => `${(i * passo).toFixed(2)},${(28 - (v / max) * 24).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <polygon points={`0,30 ${pts} 100,30`} fill={cor} opacity={0.12} />
      <polyline points={pts} fill="none" stroke={cor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
