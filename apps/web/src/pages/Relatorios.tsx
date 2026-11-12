import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Printer, Sheet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, qs, type Dashboard, type ListaRelatorio } from "../api";
import { useAuth } from "../auth";
import { BarraFiltros } from "../components/Filtros";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, BotaoCopiar, Campo, Cartao, Carregando, cx, Ponto, rotuloStatus } from "../components/ui";
import { useEmpresas, useEtiquetas, useFiltros, useOrigens, useVendedores } from "../hooks";
import { data, dataHora, isoDia, numero, pct, telefone } from "../lib/formato";

const SECOES = [
  { id: "empresas", rotulo: "Por empresa" },
  { id: "origens", rotulo: "Por origem" },
  { id: "vendedores", rotulo: "Por vendedor" },
  { id: "cruzamento", rotulo: "Vendedor × origem" },
  { id: "lista", rotulo: "Lista de atendimentos" },
] as const;
type Secao = (typeof SECOES)[number]["id"];

/** Colunas de origem no cruzamento vendedor × origem (as demais somam em "Outras") */
const MAX_COLUNAS_ORIGEM = 5;

export function PaginaRelatorios() {
  const { usuario } = useAuth();
  const { filtros } = useFiltros();
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState("Relatório de atendimentos por vendedor e origem");
  const [secoes, setSecoes] = useState<Set<Secao>>(new Set(SECOES.map((s) => s.id)));
  const [baixando, setBaixando] = useState(false);
  const [erroPlanilha, setErroPlanilha] = useState<string | null>(null);

  const consulta = qs({
    empresa_id: filtros.empresa_id,
    inicio: filtros.inicio,
    fim: filtros.fim,
    vendedor_id: filtros.vendedor_id,
    origem_id: filtros.origem_id,
    etiqueta_id: filtros.etiqueta_id,
  });
  const resumo = useQuery({
    queryKey: ["dashboard", consulta],
    queryFn: () => api<Dashboard>(`/dashboard${consulta}`),
    placeholderData: (anterior) => anterior,
  });
  const chaveLista = ["relatorio-lista", consulta];
  const buscarLista = () => api<ListaRelatorio>(`/atendimentos/relatorio${consulta}`);
  const lista = useQuery({ queryKey: chaveLista, queryFn: buscarLista, enabled: secoes.has("lista"), placeholderData: (a) => a });

  const nomeArquivo = `relatorio-atribuicoes-${isoDia(new Date())}`;

  function gerarPdf() {
    // O navegador usa o título da página como nome do PDF
    const anterior = document.title;
    document.title = nomeArquivo;
    window.addEventListener("afterprint", () => (document.title = anterior), { once: true });
    window.print();
  }

  async function baixarPlanilha() {
    setBaixando(true);
    setErroPlanilha(null);
    try {
      const d = await qc.fetchQuery({ queryKey: chaveLista, queryFn: buscarLista, staleTime: 10_000 });
      baixarCsv(`${nomeArquivo}.csv`, d);
    } catch (e) {
      setErroPlanilha((e as Error).message);
    } finally {
      setBaixando(false);
    }
  }

  const alternar = (id: Secao) =>
    setSecoes((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <div className="print:hidden">
        <Titulo
          titulo="Relatórios"
          descricao="Escolha os filtros, confira a prévia e gere o PDF ou a planilha para enviar. O link desta página guarda os filtros."
        />
        <BarraFiltros extras={["vendedor", "origem", "etiqueta"]} />

        <Cartao className="mb-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="grid gap-3">
              <Campo rotulo="Título do relatório" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
                <legend className="mb-1.5 text-xs font-medium text-ink-2">Incluir no relatório</legend>
                {SECOES.map((s) => (
                  <label key={s.id} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={secoes.has(s.id)} onChange={() => alternar(s.id)} />
                    {s.rotulo}
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="flex flex-wrap gap-2">
              <Botao variante="primario" onClick={gerarPdf} disabled={!resumo.data}>
                <Printer className="size-4" /> Gerar PDF
              </Botao>
              <Botao onClick={baixarPlanilha} carregando={baixando}>
                {!baixando && <Sheet className="size-4" />} Baixar planilha (Excel)
              </Botao>
              <BotaoCopiar texto={window.location.href} rotulo="Copiar link" />
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <FileDown className="size-3.5" /> Em "Gerar PDF", escolha <b className="font-medium text-ink-2">Salvar como PDF</b> no destino da impressão.
          </p>
          {erroPlanilha && <Alerta>{erroPlanilha}</Alerta>}
        </Cartao>
      </div>

      {resumo.error ? (
        <Alerta>{(resumo.error as Error).message}</Alerta>
      ) : !resumo.data ? (
        <Carregando />
      ) : (
        <Documento
          titulo={titulo}
          d={resumo.data}
          secoes={secoes}
          lista={secoes.has("lista") ? lista.data : undefined}
          listaCarregando={secoes.has("lista") && lista.isLoading}
          autor={usuario?.nome ?? ""}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Documento: o mesmo componente é a prévia na tela e o PDF impresso   */
/* ------------------------------------------------------------------ */

function Documento({
  titulo,
  d,
  secoes,
  lista,
  listaCarregando,
  autor,
}: {
  titulo: string;
  d: Dashboard;
  secoes: Set<Secao>;
  lista?: ListaRelatorio;
  listaCarregando: boolean;
  autor: string;
}) {
  const { filtros } = useFiltros();
  const empresas = useEmpresas().data ?? [];
  const vendedores = useVendedores().data ?? [];
  const origens = useOrigens().data ?? [];
  const etiquetas = useEtiquetas().data ?? [];
  const total = d.resumo.total;

  const nomeDe = <T extends { id: string; nome: string }>(lista: T[], id?: string, todos = "Todas") =>
    id ? (lista.find((x) => x.id === id)?.nome ?? "—") : todos;
  const periodo = filtros.inicio && filtros.fim ? `${data(`${filtros.inicio}T12:00:00`)} a ${data(`${filtros.fim}T12:00:00`)}` : "Todo o período";
  const filtrosTexto: [string, string][] = [
    ["Período", periodo],
    ["Empresa", nomeDe(empresas, filtros.empresa_id)],
    ["Vendedor", nomeDe(vendedores, filtros.vendedor_id, "Todos")],
    ["Origem", filtros.origem_id === "nenhuma" ? "Sem origem identificada" : nomeDe(origens, filtros.origem_id)],
    ["Etiqueta", nomeDe(etiquetas, filtros.etiqueta_id)],
  ];

  const nomeOrigem = (id: string | null) => (id ? (d.porOrigem.find((o) => o.id === id)?.nome ?? "—") : "Sem origem");
  const corOrigem = (id: string | null) => d.porOrigem.find((o) => o.id === id)?.cor ?? "#c3c6d0";

  return (
    <article className="folha mx-auto max-w-[1000px] rounded-xl border border-line px-4 py-5 sm:px-8 sm:py-7 shadow-sm text-[13px]">
      <header className="mb-5 border-b border-line pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Grupo Asia · Painel de Atribuições</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">{titulo || "Relatório"}</h1>
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {filtrosTexto.map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <dt className="text-muted">{k}:</dt>
              <dd className="font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-1.5 text-[11px] text-muted">
          Gerado em {dataHora(new Date().toISOString())}
          {autor && ` por ${autor}`}. Cada atendimento conta para o último vendedor que o recebeu; o período considera a data da última atribuição.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Indicador rotulo="Atendimentos" valor={numero(total)} />
        <Indicador rotulo="Vendedores" valor={numero(d.resumo.vendedores)} />
        <Indicador rotulo="Repassados" valor={numero(d.resumo.reatribuidos)} sub={pct(d.resumo.reatribuidos, total)} />
        <Indicador rotulo="Com origem" valor={numero(total - d.resumo.semOrigem)} sub={pct(total - d.resumo.semOrigem, total)} />
        <Indicador rotulo="A revisar" valor={numero(d.resumo.aRevisar + d.resumo.pendentes)} sub={d.resumo.pendentes ? `${numero(d.resumo.pendentes)} em análise` : undefined} />
      </section>

      {total === 0 ? (
        <p className="py-10 text-center text-muted">Nenhum atendimento com estes filtros.</p>
      ) : (
        <>
          {secoes.has("empresas") && !filtros.empresa_id && (
            <Bloco titulo="Atendimentos por empresa">
              <TabelaParticipacao
                cabecalho="Empresa"
                total={total}
                linhas={d.porEmpresa.map((e) => ({ chave: e.id, rotulo: e.nome, cor: e.cor, valor: e.total }))}
              />
            </Bloco>
          )}

          {secoes.has("origens") && (
            <Bloco titulo="Atendimentos por origem">
              <TabelaParticipacao
                cabecalho="Origem"
                total={total}
                linhas={d.porOrigem.map((o) => ({ chave: o.id ?? "nenhuma", rotulo: o.nome ?? "Sem origem identificada", cor: o.cor ?? "#c3c6d0", valor: o.total }))}
              />
            </Bloco>
          )}

          {secoes.has("vendedores") && (
            <Bloco titulo="Atendimentos por vendedor">
              <table>
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                    <Th>Vendedor</Th>
                    {!filtros.empresa_id && <Th>Empresa</Th>}
                    <Th direita>Atendimentos</Th>
                    <Th direita>% do total</Th>
                    <Th direita>Repassados</Th>
                    <Th>Principal origem</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.porVendedor.map((v) => {
                    const principal = d.vendedorOrigem
                      .filter((x) => x.vendedorId === v.id && x.origemId)
                      .sort((a, b) => b.total - a.total)[0];
                    return (
                      <tr key={v.id} className="border-b border-line/70">
                        <Td className="font-medium text-ink">{v.nome}</Td>
                        {!filtros.empresa_id && (
                          <Td>
                            <span className="inline-flex items-center gap-1.5">
                              <Ponto cor={v.empresaCor} /> {v.empresaNome}
                            </span>
                          </Td>
                        )}
                        <Td direita>{numero(v.total)}</Td>
                        <Td direita>{pct(v.total, total)}</Td>
                        <Td direita>{numero(v.reatribuidos)}</Td>
                        <Td>{principal ? `${nomeOrigem(principal.origemId)} (${numero(principal.total)})` : "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Bloco>
          )}

          {secoes.has("cruzamento") && <Cruzamento d={d} nomeOrigem={nomeOrigem} corOrigem={corOrigem} />}

          {secoes.has("lista") && (
            <Bloco titulo="Lista de atendimentos" quebraAntes>
              {listaCarregando || !lista ? (
                <p className="text-muted">Carregando a lista…</p>
              ) : (
                <>
                  {lista.total > lista.itens.length && (
                    <p className="mb-2 text-xs text-muted">
                      Mostrando os {numero(lista.itens.length)} mais recentes de {numero(lista.total)}. A planilha traz o mesmo limite; filtre um período menor para ver todos.
                    </p>
                  )}
                  <table className="text-[12px]">
                    <thead>
                      <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                        <Th>Data</Th>
                        <Th>Cliente</Th>
                        <Th>Telefone</Th>
                        {!filtros.empresa_id && <Th>Empresa</Th>}
                        <Th>Vendedor</Th>
                        <Th>Origem</Th>
                        <Th direita>Atrib.</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.itens.map((a) => (
                        <tr key={a.id} className="border-b border-line/70 align-top">
                          <Td className="whitespace-nowrap tabular">{dataHora(a.ultimaAtribuicaoEm)}</Td>
                          <Td className="text-ink">{a.clienteNome}</Td>
                          <Td className="whitespace-nowrap tabular">{telefoneOuVazio(a.clienteTelefone)}</Td>
                          {!filtros.empresa_id && <Td className="whitespace-nowrap">{a.empresaNome.replace("Asia ", "")}</Td>}
                          <Td>{a.vendedorNome}</Td>
                          <Td>{a.origemNome ?? <span className="text-muted">Sem origem</span>}</Td>
                          <Td direita>{a.totalAtribuicoes}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </Bloco>
          )}
        </>
      )}
    </article>
  );
}

function Cruzamento({ d, nomeOrigem, corOrigem }: { d: Dashboard; nomeOrigem: (id: string | null) => string; corOrigem: (id: string | null) => string }) {
  const colunas = d.porOrigem.slice(0, MAX_COLUNAS_ORIGEM).map((o) => o.id);
  const temOutras = d.porOrigem.length > MAX_COLUNAS_ORIGEM;
  const valor = (vendedorId: string, origemId: string | null) =>
    d.vendedorOrigem.find((x) => x.vendedorId === vendedorId && x.origemId === origemId)?.total ?? 0;
  return (
    <Bloco titulo="Vendedor × origem" sub="Quantos atendimentos de cada vendedor vieram de cada origem.">
      <table className="text-[12px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
            <Th>Vendedor</Th>
            {colunas.map((id) => (
              <Th key={id ?? "nenhuma"} direita>
                <span className="inline-flex items-center justify-end gap-1.5 normal-case tracking-normal">
                  <Ponto cor={corOrigem(id)} />
                  {nomeOrigem(id)}
                </span>
              </Th>
            ))}
            {temOutras && <Th direita>Outras</Th>}
            <Th direita>Total</Th>
          </tr>
        </thead>
        <tbody>
          {d.porVendedor.map((v) => {
            const outras = v.total - colunas.reduce((s, id) => s + valor(v.id, id), 0);
            return (
              <tr key={v.id} className="border-b border-line/70">
                <Td className="font-medium text-ink">{v.nome}</Td>
                {colunas.map((id) => {
                  const n = valor(v.id, id);
                  return (
                    <Td key={id ?? "nenhuma"} direita className={n ? "text-ink" : "text-muted/60"}>
                      {n ? numero(n) : "–"}
                    </Td>
                  );
                })}
                {temOutras && <Td direita>{outras ? numero(outras) : "–"}</Td>}
                <Td direita className="font-medium text-ink">
                  {numero(v.total)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Bloco>
  );
}

function TabelaParticipacao({ cabecalho, linhas, total }: { cabecalho: string; total: number; linhas: { chave: string; rotulo: string; cor: string; valor: number }[] }) {
  const maior = Math.max(...linhas.map((l) => l.valor), 1);
  return (
    <table>
      <thead>
        <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
          <Th>{cabecalho}</Th>
          <Th direita>Atendimentos</Th>
          <Th direita>%</Th>
          <Th className="w-[38%]">
            <span className="sr-only">Gráfico</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.chave} className="border-b border-line/70">
            <Td className="text-ink">
              <span className="inline-flex items-center gap-1.5">
                <Ponto cor={l.cor} /> {l.rotulo}
              </span>
            </Td>
            <Td direita>{numero(l.valor)}</Td>
            <Td direita>{pct(l.valor, total)}</Td>
            <Td>
              <div className="h-2.5 rounded-sm bg-surface-2">
                <div className="h-full rounded-sm" style={{ width: `${(l.valor / maior) * 100}%`, background: l.cor }} />
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Indicador({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <p className="text-[11px] text-muted">{rotulo}</p>
      <p className="text-lg font-semibold tabular text-ink">{valor}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Bloco({ titulo, sub, quebraAntes, children }: { titulo: string; sub?: string; quebraAntes?: boolean; children: ReactNode }) {
  return (
    <section className={cx("mb-7", quebraAntes && "print:break-before-page")}>
      <h2 className="text-sm font-semibold text-ink break-after-avoid">{titulo}</h2>
      {sub && <p className="text-xs text-muted">{sub}</p>}
      <div className="mt-2 overflow-x-auto print:overflow-visible">{children}</div>
    </section>
  );
}

const Th = ({ children, direita, className }: { children?: ReactNode; direita?: boolean; className?: string }) => (
  <th className={cx("py-1.5 pr-3 font-medium", direita && "text-right", className)}>{children}</th>
);
const Td = ({ children, direita, className }: { children?: ReactNode; direita?: boolean; className?: string }) => (
  <td className={cx("py-1.5 pr-3 text-ink-2", direita && "text-right tabular", className)}>{children}</td>
);

const telefoneOuVazio = (t: string) => (t.startsWith("id:") ? "—" : telefone(t));

/* ------------------------------------------------------------------ */
/* Planilha: CSV com ";" e BOM, que o Excel em português abre direto   */
/* ------------------------------------------------------------------ */

function baixarCsv(nome: string, d: ListaRelatorio) {
  const cab = [
    "Última atribuição",
    "Primeira atribuição",
    "Cliente",
    "Telefone",
    "Empresa",
    "Vendedor",
    "Origem",
    "Etiquetas (IA)",
    "Etiquetas da plataforma",
    "Atribuições",
    "Situação",
  ];
  const celula = (v: string | number) => {
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = d.itens.map((a) =>
    [
      dataHoraPlanilha(a.ultimaAtribuicaoEm),
      dataHoraPlanilha(a.primeiraAtribuicaoEm),
      a.clienteNome,
      telefoneOuVazio(a.clienteTelefone),
      a.empresaNome,
      a.vendedorNome,
      a.origemNome ?? "Sem origem",
      a.etiquetas.join(", "),
      a.etiquetasPlataforma.join(", "),
      a.totalAtribuicoes,
      rotuloStatus(a.status),
    ]
      .map(celula)
      .join(";"),
  );
  const blob = new Blob(["﻿" + [cab.join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "12/11/2026 08:30": formato que o Excel reconhece como data */
const fmtPlanilha = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dataHoraPlanilha = (iso: string) => fmtPlanilha.format(new Date(iso)).replace(",", "");
