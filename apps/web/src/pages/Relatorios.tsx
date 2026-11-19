import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Printer, Sheet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, qs, type Grupo, type ListaRelatorio, type Painel } from "../api";
import { useAuth } from "../auth";
import { BarraFiltros } from "../components/Filtros";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, BotaoCopiar, Campo, Cartao, Carregando, cx, Ponto } from "../components/ui";
import { useAtendentes, useChatbots, useDepartamentos, useFiltros, useOrigens } from "../hooks";
import { data, dataHora, duracao, isoDia, numero, porcento, telefone } from "../lib/formato";
import { usePainel } from "./Dashboard";

const SECOES = [
  { id: "chatbots", rotulo: "Por chatbot" },
  { id: "atendentes", rotulo: "Atendentes e tempos" },
  { id: "departamentos", rotulo: "Por departamento" },
  { id: "origens", rotulo: "Por origem" },
  { id: "cidades", rotulo: "Por cidade" },
  { id: "canais", rotulo: "Canal e anúncios" },
  { id: "lista", rotulo: "Lista de atendimentos" },
] as const;
type Secao = (typeof SECOES)[number]["id"];

export function PaginaRelatorios() {
  const { usuario, empresa } = useAuth();
  const { consulta } = useFiltros();
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState("Relatório de atendimento");
  const [secoes, setSecoes] = useState<Set<Secao>>(new Set(SECOES.map((s) => s.id)));
  const [baixando, setBaixando] = useState(false);
  const [erroPlanilha, setErroPlanilha] = useState<string | null>(null);
  const painel = usePainel();
  const q = qs(consulta);
  const chaveLista = ["relatorio-lista", empresa?.id, q];
  const buscarLista = () => api<ListaRelatorio>(`/atendimentos/relatorio${q}`);
  const lista = useQuery({ queryKey: chaveLista, queryFn: buscarLista, enabled: secoes.has("lista") && !!empresa, placeholderData: (a) => a });
  const nomeArquivo = `relatorio-atendimento-${isoDia(new Date())}`;

  function gerarPdf() {
    const anterior = document.title;
    document.title = nomeArquivo;
    window.addEventListener("afterprint", () => (document.title = anterior), { once: true });
    window.print();
  }
  async function baixarPlanilha() {
    setBaixando(true);
    setErroPlanilha(null);
    try {
      baixarCsv(`${nomeArquivo}.csv`, await qc.fetchQuery({ queryKey: chaveLista, queryFn: buscarLista, staleTime: 10_000 }));
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
        <Titulo titulo="Relatórios" descricao="Escolha os filtros, confira a prévia e gere o PDF ou a planilha. O link desta página guarda os filtros." />
        <BarraFiltros extras={["atendente", "time", "departamento", "origem", "cidade"]} />
        <Cartao className="mb-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="grid gap-3">
              <Campo rotulo="Título do relatório" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
                <legend className="mb-1.5 text-xs font-medium text-ink-2">Incluir no relatório</legend>
                {SECOES.map((s) => (
                  <label key={s.id} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="size-4" checked={secoes.has(s.id)} onChange={() => alternar(s.id)} />
                    {s.rotulo}
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="flex flex-wrap gap-2">
              <Botao variante="primario" onClick={gerarPdf} disabled={!painel.data}>
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
      {painel.error ? (
        <Alerta>{(painel.error as Error).message}</Alerta>
      ) : !painel.data ? (
        <Carregando />
      ) : (
        <Documento titulo={titulo} d={painel.data} secoes={secoes} lista={secoes.has("lista") ? lista.data : undefined} autor={usuario?.nome ?? ""} empresaNome={empresa?.nome ?? ""} />
      )}
    </>
  );
}

function Documento({ titulo, d, secoes, lista, autor, empresaNome }: { titulo: string; d: Painel; secoes: Set<Secao>; lista?: ListaRelatorio; autor: string; empresaNome: string }) {
  const { filtros } = useFiltros();
  const chatbots = useChatbots().data ?? [];
  const atendentes = useAtendentes().data ?? [];
  const departamentos = useDepartamentos().data ?? [];
  const origens = useOrigens().data ?? [];
  const r = d.resumo;
  const nomeDe = (l: { id: string; nome: string }[], id?: string, todos = "Todos") => (id ? (l.find((x) => x.id === id)?.nome ?? "—") : todos);
  const filtrosTexto: [string, string][] = [
    ["Período", filtros.inicio && filtros.fim ? `${data(`${filtros.inicio}T12:00:00`)} a ${data(`${filtros.fim}T12:00:00`)}` : "Todo o período"],
    ["Chatbot", nomeDe(chatbots, filtros.chatbot_id)],
    ["Atendente", nomeDe(atendentes, filtros.atendente_id)],
    ["Departamento", nomeDe(departamentos, filtros.departamento_id)],
    ["Origem", nomeDe(origens, filtros.origem_id, "Todas")],
    ...(filtros.cidade ? ([["Cidade", filtros.cidade]] as [string, string][]) : []),
  ];

  return (
    <article className="folha mx-auto max-w-[1000px] rounded-xl border border-line px-4 py-5 sm:px-8 sm:py-7 shadow-sm text-[13px]">
      <header className="mb-5 border-b border-line pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{empresaNome} · Painel de Atendimento</p>
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
          {autor && ` por ${autor}`}. Tempos em horário de atendimento; o período considera o início do atendimento.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Atendimentos" valor={numero(r.total)} sub={`${numero(r.leadsNovos)} leads novos`} />
        <Indicador rotulo="Foram para humano" valor={numero(r.humano)} sub={porcento(r.humano, r.total)} />
        <Indicador rotulo="Sem atendimento humano" valor={numero(r.semHumano)} sub={porcento(r.semHumano, r.humano)} />
        <Indicador rotulo="Humano em até 30 min" valor={porcento(r.ate30, r.comTempo)} sub={`${numero(r.ate30)} de ${numero(r.comTempo)}`} />
        <Indicador rotulo="Robô → humano" valor={duracao(r.tempoAteHumano)} sub="média" />
        <Indicador rotulo="1ª resposta" valor={duracao(r.tempoPrimeiraResposta)} sub="média" />
        <Indicador rotulo="Resposta do atendente" valor={duracao(r.tempoMedioResposta)} sub="média" />
        <Indicador rotulo="Esperas > 30 min" valor={numero(r.esperas30)} sub={`${numero(r.semResposta)} sem resposta`} />
      </section>

      {r.total === 0 ? (
        <p className="py-10 text-center text-muted">Nenhum atendimento com estes filtros.</p>
      ) : (
        <>
          {secoes.has("chatbots") && !filtros.chatbot_id && <TabelaGrupo titulo="Por chatbot" cabecalho="Chatbot" linhas={d.porChatbot} total={r.total} />}
          {secoes.has("atendentes") && <TabelaAtendentesDoc linhas={d.porAtendente} tr={d.transferencias} />}
          {secoes.has("departamentos") && <TabelaGrupo titulo="Por departamento" cabecalho="Departamento" linhas={d.porDepartamento} total={r.total} />}
          {secoes.has("origens") && <TabelaGrupo titulo="Por origem" cabecalho="Origem" linhas={d.porOrigem} total={r.total} />}
          {secoes.has("cidades") && <TabelaGrupo titulo="Por cidade" cabecalho="Cidade" linhas={d.porCidade} total={r.total} />}
          {secoes.has("canais") && (
            <>
              <TabelaGrupo titulo="Por canal de entrada" cabecalho="Canal" linhas={d.porCanal} total={r.total} />
              <TabelaGrupo titulo="Anúncios por plataforma" cabecalho="Plataforma" linhas={d.porAnuncio} total={r.total} />
            </>
          )}
          {secoes.has("lista") && (
            <Bloco titulo="Lista de atendimentos" quebraAntes>
              {!lista ? (
                <p className="text-muted">Carregando a lista…</p>
              ) : (
                <>
                  {lista.total > lista.itens.length && (
                    <p className="mb-2 text-xs text-muted">
                      Mostrando os {numero(lista.itens.length)} mais recentes de {numero(lista.total)}. Filtre um período menor para ver todos.
                    </p>
                  )}
                  <table className="text-[12px]">
                    <thead>
                      <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                        <Th>Início</Th>
                        <Th>Cliente</Th>
                        <Th>Atendente</Th>
                        <Th>Origem</Th>
                        <Th>Departamento</Th>
                        <Th direita>Robô → humano</Th>
                        <Th direita>Resp. média</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.itens.map((a) => (
                        <tr key={a.id} className="border-b border-line/70 align-top">
                          <Td className="whitespace-nowrap tabular">{dataHora(a.inicioEm)}</Td>
                          <Td className="text-ink">{a.contatoNome || "Sem nome"}</Td>
                          <Td>{a.atendenteNome ?? (a.precisouHumano ? "—" : "Só robô")}</Td>
                          <Td>{a.origemNome ?? "—"}</Td>
                          <Td>{a.departamentoNome ?? "—"}</Td>
                          <Td direita>{a.semHumano ? "sem humano" : duracao(a.tempoAteHumanoS)}</Td>
                          <Td direita>{duracao(a.tempoMedioRespostaS)}</Td>
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

function TabelaGrupo({ titulo, cabecalho, linhas, total }: { titulo: string; cabecalho: string; linhas: Grupo[]; total: number }) {
  if (!linhas.length) return null;
  const maior = Math.max(...linhas.map((l) => l.total), 1);
  return (
    <Bloco titulo={titulo}>
      <table>
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
            <Th>{cabecalho}</Th>
            <Th direita>Atendimentos</Th>
            <Th direita>%</Th>
            <Th direita>Até 30 min</Th>
            <Th direita>Robô → humano</Th>
            <Th className="w-[28%]">
              <span className="sr-only">Gráfico</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave ?? l.rotulo} className="border-b border-line/70">
              <Td className="text-ink">
                <span className="inline-flex items-center gap-1.5">
                  {l.cor && <Ponto cor={l.cor} />} {l.rotulo}
                </span>
              </Td>
              <Td direita>{numero(l.total)}</Td>
              <Td direita>{porcento(l.total, total)}</Td>
              <Td direita>{porcento(l.ate30, l.comTempo)}</Td>
              <Td direita>{duracao(l.tempoAteHumano)}</Td>
              <Td>
                <div className="h-2.5 rounded-sm bg-surface-2">
                  <div className="h-full rounded-sm" style={{ width: `${(l.total / maior) * 100}%`, background: l.cor ?? "var(--accent)" }} />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Bloco>
  );
}

function TabelaAtendentesDoc({ linhas, tr }: { linhas: Grupo[]; tr: Painel["transferencias"] }) {
  if (!linhas.length) return null;
  const t = new Map(tr.map((x) => [x.chave, x]));
  return (
    <Bloco titulo="Atendentes e tempos" sub="Robô → humano: da transferência à 1ª resposta. Resposta média: entre a mensagem do cliente e a resposta do atendente.">
      <table className="text-[12px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
            <Th>Atendente</Th>
            <Th direita>Atend.</Th>
            <Th direita>Robô → humano</Th>
            <Th direita>Resp. média</Th>
            <Th direita>Até 30 min</Th>
            <Th direita>Esperas &gt; 30</Th>
            <Th direita>Transf. feitas / recebidas</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((a) => (
            <tr key={a.chave ?? "sem"} className="border-b border-line/70">
              <Td className="font-medium text-ink">
                {a.rotulo}
                {a.timeNome && <span className="ml-1 font-normal text-muted">({a.timeNome})</span>}
              </Td>
              <Td direita>{numero(a.total)}</Td>
              <Td direita>{duracao(a.tempoAteHumano)}</Td>
              <Td direita>{duracao(a.tempoMedioResposta)}</Td>
              <Td direita>{porcento(a.ate30, a.comTempo)}</Td>
              <Td direita>{numero(a.esperas30)}</Td>
              <Td direita>
                {numero(a.chave ? (t.get(a.chave)?.feitas ?? 0) : 0)} / {numero(a.chave ? (t.get(a.chave)?.recebidas ?? 0) : 0)}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Bloco>
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

/* Planilha: CSV com ";" e BOM, que o Excel em português abre direto */
const fmtPlanilha = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dataHoraPlanilha = (iso: string) => fmtPlanilha.format(new Date(iso)).replace(",", "");
const minutos = (s: number | null) => (s === null ? "" : String(Math.round(s / 60)));

function baixarCsv(nome: string, d: ListaRelatorio) {
  const cab = [
    "Início",
    "Protocolo",
    "Chatbot",
    "Cliente",
    "Telefone",
    "Lead novo",
    "Atendente",
    "Origem",
    "Departamento",
    "Cidade",
    "Canal",
    "Fonte",
    "Interesse",
    "Etiquetas",
    "Foi para humano",
    "Sem humano",
    "Robô→humano (min)",
    "Resposta média (min)",
    "Esperas >30 min",
    "Transferências",
    "Resumo",
  ];
  const celula = (v: string | number | boolean | null | undefined) => {
    const s = v === true ? "Sim" : v === false ? "Não" : String(v ?? "");
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = d.itens.map((a) =>
    [
      dataHoraPlanilha(a.inicioEm),
      a.protocolo,
      a.chatbotNome,
      a.contatoNome,
      a.contatoTelefone ? telefone(a.contatoTelefone) : "",
      a.leadNovo,
      a.atendenteNome,
      a.origemNome,
      a.departamentoNome,
      a.cidade,
      a.canal,
      a.fonte,
      a.interesse,
      a.etiquetas.join(", "),
      a.precisouHumano,
      a.semHumano,
      minutos(a.tempoAteHumanoS),
      minutos(a.tempoMedioRespostaS),
      a.esperasAcima30,
      a.transferencias,
      a.resumo,
    ]
      .map(celula)
      .join(";"),
  );
  const blob = new Blob(["﻿" + [cab.join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
