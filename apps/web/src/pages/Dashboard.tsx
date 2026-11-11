import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, qs, type Dashboard } from "../api";
import { BarraParticipacao, ListaBarras } from "../components/Barras";
import { BarraFiltros } from "../components/Filtros";
import { Titulo } from "../components/Layout";
import { Alerta, Cartao, Carregando, Ponto, Vazio } from "../components/ui";
import { useEmpresas, useFiltros, useOrigens } from "../hooks";
import { diaCurto, diasEntre, numero, pct } from "../lib/formato";

export function PaginaDashboard() {
  const { filtros, params } = useFiltros();
  const empresas = useEmpresas();
  const origens = useOrigens();

  const consulta = qs({
    empresa_id: filtros.empresa_id,
    inicio: filtros.inicio,
    fim: filtros.fim,
    vendedor_id: filtros.vendedor_id,
    origem_id: filtros.origem_id,
  });
  const q = useQuery({
    queryKey: ["dashboard", consulta],
    queryFn: () => api<Dashboard>(`/dashboard${consulta}`),
    refetchInterval: 60_000,
    placeholderData: (anterior) => anterior,
  });

  /** Link para a lista de atendimentos mantendo o filtro atual */
  const linkLista = (extra: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    p.delete("pagina");
    return `/atendimentos?${p}`;
  };

  return (
    <>
      <Titulo titulo="Painel" descricao="Atendimentos atribuídos pelo chatbot. Cada atendimento conta para o último vendedor que o recebeu." />
      <BarraFiltros extras={["vendedor", "origem"]} />
      {q.isLoading || !q.data ? (
        q.error ? <Alerta>{(q.error as Error).message}</Alerta> : <Carregando />
      ) : q.data.resumo.total === 0 ? (
        <Cartao>
          <Vazio titulo="Nenhum atendimento neste filtro">
            Quando o chatbot atribuir conversas a vendedores, elas aparecem aqui. Confira em <Link className="text-accent underline" to="/eventos">Eventos recebidos</Link> se o webhook está chegando.
          </Vazio>
        </Cartao>
      ) : (
        <Conteudo d={q.data} filtros={filtros} empresas={empresas.data ?? []} origens={origens.data ?? []} linkLista={linkLista} />
      )}
    </>
  );
}

function Conteudo({
  d,
  filtros,
  empresas,
  origens,
  linkLista,
}: {
  d: Dashboard;
  filtros: ReturnType<typeof useFiltros>["filtros"];
  empresas: { id: string; nome: string; cor: string }[];
  origens: { id: string; nome: string; cor: string }[];
  linkLista: (extra: Record<string, string>) => string;
}) {
  const r = d.resumo;
  const empresasNoGrafico = filtros.empresa_id ? empresas.filter((e) => e.id === filtros.empresa_id) : empresas;

  // Série diária com dias vazios preenchidos (eixo de tempo contínuo)
  const serie = useMemo(() => {
    const dias = d.serie.map((s) => s.dia);
    const inicio = filtros.inicio ?? dias[0];
    const fim = filtros.fim ?? dias[dias.length - 1];
    if (!inicio || !fim) return [];
    const mapa = new Map<string, Record<string, number | string>>();
    for (const dia of diasEntre(inicio, fim)) {
      const linha: Record<string, number | string> = { dia };
      for (const e of empresasNoGrafico) linha[e.id] = 0;
      mapa.set(dia, linha);
    }
    for (const s of d.serie) {
      const linha = mapa.get(s.dia);
      if (linha) linha[s.empresaId] = s.total;
    }
    return [...mapa.values()];
  }, [d.serie, filtros.inicio, filtros.fim, empresasNoGrafico]);

  return (
    <div className="grid gap-4">
      {/* Números principais */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Numero rotulo="Atendimentos" valor={r.total} destaque />
        <Numero rotulo="Vendedores atendendo" valor={r.vendedores} />
        <Numero rotulo="Repassados entre vendedores" valor={r.reatribuidos} detalhe={pct(r.reatribuidos, r.total)} />
        <Numero rotulo="Sem origem identificada" valor={r.semOrigem} detalhe={pct(r.semOrigem, r.total)} link={linkLista({ origem: "nenhuma" })} />
        <Numero
          rotulo="Aguardando revisão"
          valor={r.aRevisar}
          detalhe={r.pendentes ? `+${numero(r.pendentes)} na fila da IA` : undefined}
          alerta={r.aRevisar > 0}
          link="/revisar"
        />
      </div>

      {!filtros.empresa_id && d.porEmpresa.length > 1 && (
        <Cartao titulo="Por empresa">
          <BarraParticipacao partes={d.porEmpresa.map((e) => ({ chave: e.id, rotulo: e.nome, valor: e.total, cor: e.cor }))} />
        </Cartao>
      )}

      <Cartao titulo="Atendimentos por dia">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="18%">
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="dia" tickFormatter={diaCurto} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={18} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, color: "var(--ink)" }}
                labelFormatter={(v) => diaCurto(String(v))}
                formatter={(v: number, chave) => [numero(v), empresas.find((e) => e.id === chave)?.nome ?? chave]}
              />
              {empresasNoGrafico.length > 1 && (
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(chave) => empresas.find((e) => e.id === chave)?.nome ?? chave} />
              )}
              {empresasNoGrafico.map((e, i) => (
                <Bar
                  key={e.id}
                  dataKey={e.id}
                  stackId="dia"
                  fill={e.cor}
                  stroke="var(--surface)"
                  strokeWidth={1}
                  radius={i === empresasNoGrafico.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={36}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Cartao>

      <div className="grid gap-4 xl:grid-cols-2">
        <Cartao titulo="De onde vieram os clientes">
          <ListaBarras
            total={r.total}
            linhas={d.porOrigem.map((o) => ({
              chave: o.id ?? "nenhuma",
              rotulo: o.nome ?? "Sem origem identificada",
              valor: o.total,
              ponto: o.cor ?? "var(--muted)",
              link: linkLista({ origem: o.id ?? "nenhuma" }),
            }))}
          />
        </Cartao>
        <Cartao
          titulo="Atendimentos por vendedor"
          acao={
            !filtros.empresa_id && (
              <div className="flex flex-wrap gap-3">
                {empresas.map((e) => (
                  <span key={e.id} className="flex items-center gap-1 text-[11px] text-muted">
                    <Ponto cor={e.cor} className="size-2" />
                    {e.nome.replace("Asia ", "")}
                  </span>
                ))}
              </div>
            )
          }
        >
          <ListaBarras
            total={r.total}
            max={15}
            linhas={d.porVendedor.map((v) => ({
              chave: v.id,
              rotulo: v.nome,
              sub: !filtros.empresa_id ? v.empresaNome : undefined,
              valor: v.total,
              cor: v.empresaCor,
              link: linkLista({ vendedor: v.id }),
            }))}
          />
        </Cartao>
      </div>

      <MatrizVendedorOrigem d={d} origensCadastro={origens} linkLista={linkLista} />

      {d.porEtiqueta.length > 0 && (
        <Cartao titulo="Etiquetas mais frequentes">
          <ListaBarras
            total={r.total}
            linhas={d.porEtiqueta.map((e) => ({ chave: e.id, rotulo: e.nome, valor: e.total, ponto: e.cor, link: linkLista({ etiqueta: e.id }) }))}
          />
        </Cartao>
      )}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  detalhe,
  destaque,
  alerta,
  link,
}: {
  rotulo: string;
  valor: number;
  detalhe?: string;
  destaque?: boolean;
  alerta?: boolean;
  link?: string;
}) {
  const corpo = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-ink-2">
        {alerta && <AlertTriangle className="size-3.5 text-warn" />}
        {rotulo}
      </p>
      <p className={destaque ? "text-3xl font-semibold tracking-tight" : "text-2xl font-semibold tracking-tight"}>{numero(valor)}</p>
      <p className="flex items-center gap-1 text-xs text-muted min-h-4">
        {detalhe}
        {link && <ArrowRight className="ml-auto size-3.5" />}
      </p>
    </>
  );
  const classe = "grid gap-0.5 rounded-xl border border-line bg-surface px-4 py-3 min-w-0";
  return link ? (
    <Link to={link} className={classe + " hover:border-muted transition-colors"}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

/** Tabela vendedor × origem: "quantos do Carlos vieram de anúncio?" Intensidade = quantidade (um só tom). */
function MatrizVendedorOrigem({
  d,
  origensCadastro,
  linkLista,
}: {
  d: Dashboard;
  origensCadastro: { id: string; nome: string; cor: string }[];
  linkLista: (extra: Record<string, string>) => string;
}) {
  const colunas = d.porOrigem.slice(0, 8);
  const celula = new Map(d.vendedorOrigem.map((c) => [`${c.vendedorId}|${c.origemId ?? "nenhuma"}`, c.total]));
  const maior = Math.max(...d.vendedorOrigem.map((c) => c.total), 1);
  const linhas = d.porVendedor.slice(0, 25);
  if (!linhas.length || !colunas.length) return null;
  const nomeOrigem = (id: string | null) => (id ? (origensCadastro.find((o) => o.id === id)?.nome ?? "—") : "Sem origem");

  return (
    <Cartao titulo="Vendedor × origem">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-[2px] text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface px-2 py-1.5 text-left text-xs font-medium text-muted">Vendedor</th>
              {colunas.map((o) => (
                <th key={o.id ?? "nenhuma"} className="px-2 py-1.5 text-center text-xs font-medium text-muted" title={nomeOrigem(o.id)}>
                  <span className="line-clamp-2">{nomeOrigem(o.id)}</span>
                </th>
              ))}
              <th className="px-2 py-1.5 text-right text-xs font-medium text-muted">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((v) => (
              <tr key={v.id}>
                <td className="sticky left-0 bg-surface px-2 py-1.5">
                  <Link to={linkLista({ vendedor: v.id })} className="flex items-center gap-2 hover:underline">
                    <Ponto cor={v.empresaCor} className="size-2" />
                    <span className="truncate max-w-44">{v.nome}</span>
                  </Link>
                </td>
                {colunas.map((o) => {
                  const n = celula.get(`${v.id}|${o.id ?? "nenhuma"}`) ?? 0;
                  const alfa = n ? 0.12 + 0.68 * (n / maior) : 0;
                  return (
                    <td
                      key={o.id ?? "nenhuma"}
                      className="rounded-[4px] px-2 py-1.5 text-center tabular"
                      style={{ background: n ? `color-mix(in srgb, var(--accent) ${Math.round(alfa * 100)}%, transparent)` : "var(--surface-2)" }}
                      title={`${v.nome} · ${nomeOrigem(o.id)}: ${n}`}
                    >
                      <span className={n ? (alfa > 0.5 ? "font-medium text-white" : "font-medium text-ink") : "text-muted"}>{n || "·"}</span>
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-semibold tabular">{numero(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.porOrigem.length > colunas.length && <p className="pt-2 text-xs text-muted">Mostrando as {colunas.length} origens mais frequentes.</p>}
    </Cartao>
  );
}
