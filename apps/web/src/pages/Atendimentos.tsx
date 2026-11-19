import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Hourglass, MessageSquareOff } from "lucide-react";
import { useNavigate } from "react-router";
import { api, qs, type AtendimentoItem, type Pagina } from "../api";
import { useAuth } from "../auth";
import { BarraFiltros } from "../components/Filtros";
import { Titulo } from "../components/Layout";
import { Alerta, Cartao, Carregando, Chip, cx, Dica, Paginacao, Ponto, Selecao, Vazio } from "../components/ui";
import { useEtiquetas, useFiltros } from "../hooks";
import { dataHora, duracao, numero, telefone } from "../lib/formato";
import { DIAS_SEMANA, FAIXAS, GLOSSARIO, ORDENS, SITUACOES } from "../lib/glossario";

const POR_PAGINA = 25;
/** Recortes sobre a demora até o 1º atendente: a conversa abre na transferência / 1ª resposta */
const SOBRE_ENTRADA = new Set(["acima30", "demorou30", "sem_humano", "ate30"]);
/** Recortes sobre as esperas durante a conversa: abre na mensagem que mais esperou */
const SOBRE_ESPERA = new Set(["esperou30", "sem_resposta"]);

export function PaginaAtendimentos() {
  const { consulta, definir, pagina, filtros } = useFiltros();
  const { empresa } = useAuth();
  const navegar = useNavigate();
  const q = qs({ ...consulta, pagina, por_pagina: POR_PAGINA });
  const lista = useQuery({
    queryKey: ["atendimentos", empresa?.id, q],
    queryFn: () => api<Pagina<AtendimentoItem>>(`/atendimentos${q}`),
    placeholderData: (a) => a,
    enabled: !!empresa,
  });
  const ver =
    SOBRE_ESPERA.has(filtros.situacao ?? "") || filtros.faixa_resposta || filtros.ordem === "espera" || filtros.ordem === "resposta"
      ? "esperas"
      : SOBRE_ENTRADA.has(filtros.situacao ?? "") || filtros.faixa_humano || filtros.ordem === "humano"
        ? "humano"
        : null;
  const irEspera = !!ver;
  const abrir = (id: string) => navegar(`/atendimentos/${id}${ver ? `?ver=${ver}` : ""}`);

  return (
    <>
      <Titulo titulo="Atendimentos" descricao="Cada linha é um atendimento (um protocolo). Clique para abrir a conversa, os tempos e de onde o cliente veio." />
      <BarraFiltros extras={["atendente", "departamento", "origem", "etiqueta", "cidade", "busca", "humano"]} />
      <Recortes />
      <Cartao>
        {lista.error ? (
          <Alerta>{(lista.error as Error).message}</Alerta>
        ) : !lista.data ? (
          <Carregando />
        ) : !lista.data.itens.length ? (
          <Vazio titulo="Nenhum atendimento neste filtro" />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <p className="text-xs text-muted">
                {numero(lista.data.total)} atendimento(s){irEspera && " · a conversa abre na mensagem que esperou"}
              </p>
              <Selecao value={filtros.ordem ?? ""} onChange={(e) => definir({ ordem: e.target.value })} className="w-60" aria-label="Ordem">
                {ORDENS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.rotulo}
                  </option>
                ))}
              </Selecao>
            </div>
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Início</th>
                    <th className="px-3 py-2 font-medium">Atendente</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium">Departamento</th>
                    <Cab dica={GLOSSARIO.roboHumano}>Robô → humano</Cab>
                    <Cab dica={GLOSSARIO.respostaMedia}>Resp. média</Cab>
                    <Cab dica="A maior espera de uma resposta do atendente nesta conversa, e quantas passaram de 30 min.">Maior espera</Cab>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lista.data.itens.map((a) => (
                    <tr key={a.id} onClick={() => abrir(a.id)} className="group cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-2.5">
                        <p className="flex items-center gap-1.5 font-medium text-ink">
                          {a.contatoNome || "Sem nome"}
                          {a.leadNovo && <span className="rounded-full bg-good-soft px-1.5 text-[10px] font-semibold text-good">NOVO</span>}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                          <Ponto cor={a.chatbotCor} className="size-2" />
                          {a.chatbotNome}
                          {a.contatoTelefone && ` · ${telefone(a.contatoTelefone)}`}
                          {a.protocolo && ` · #${a.protocolo}`}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular text-ink-2">{dataHora(a.inicioEm)}</td>
                      <td className="px-3 py-2.5">{a.atendenteNome ?? <span className="text-muted">{a.precisouHumano ? "—" : "Só robô"}</span>}</td>
                      <td className="px-3 py-2.5">
                        {a.origemNome ? (
                          <Chip cor={a.origemCor}>{a.origemNome}</Chip>
                        ) : (
                          <span className="text-muted">{a.status === "pendente" || a.status === "processando" ? "IA analisando…" : "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">{a.departamentoNome ? <Chip cor={a.departamentoCor}>{a.departamentoNome}</Chip> : <span className="text-muted">—</span>}</td>
                      <td className={cx("px-3 py-2.5 text-right tabular", a.semHumano && "text-bad", a.atendidoAte30 === false && !a.semHumano && "text-warn")}>
                        {a.semHumano ? "sem humano" : duracao(a.tempoAteHumanoS)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">{duracao(a.tempoMedioRespostaS)}</td>
                      <td className="px-3 py-2.5 text-right tabular">
                        <span className={cx((a.tempoMaxRespostaS ?? 0) > 1800 && "text-bad")}>{duracao(a.tempoMaxRespostaS)}</span>
                        {(a.esperasAcima30 > 0 || a.semResposta > 0) && (
                          <span className="mt-0.5 flex justify-end gap-2 text-[11px]">
                            {a.esperasAcima30 > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-bad" title="Esperas acima de 30 min">
                                <Hourglass className="size-3" /> {a.esperasAcima30}× &gt;30
                              </span>
                            )}
                            {a.semResposta > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-warn" title="Mensagens sem resposta">
                                <MessageSquareOff className="size-3" /> {a.semResposta}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="pr-3 text-muted group-hover:text-ink">
                        <ChevronRight className="size-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao pagina={pagina} total={lista.data.total} porPagina={POR_PAGINA} onPagina={(p) => definir({ pagina: String(p) })} />
          </>
        )}
      </Cartao>
    </>
  );
}

function Cab({ children, dica }: { children: string; dica: string }) {
  return (
    <th className="px-3 py-2 text-right font-medium">
      <span className="inline-flex items-center gap-1">
        {children} <Dica texto={dica} />
      </span>
    </th>
  );
}

/** O recorte que trouxe a pessoa até aqui (clique no painel), em chips removíveis com explicação */
function Recortes() {
  const { filtros, definir } = useFiltros();
  const etiquetas = useEtiquetas();
  const chips: { chave: string; texto: string; dica?: string }[] = [];
  const sit = SITUACOES.find((s) => s.id === filtros.situacao);
  if (sit) chips.push({ chave: "situacao", texto: sit.rotulo, dica: sit.dica });
  if (filtros.faixa_humano) chips.push({ chave: "faixa_humano", texto: `Robô → humano: ${FAIXAS[Number(filtros.faixa_humano)] ?? "?"}`, dica: GLOSSARIO.faixasAteHumano });
  if (filtros.faixa_resposta) chips.push({ chave: "faixa_resposta", texto: `Resposta média: ${FAIXAS[Number(filtros.faixa_resposta)] ?? "?"}`, dica: GLOSSARIO.faixasResposta });
  if (filtros.dia_semana) chips.push({ chave: "dia_semana", texto: `Chegou ${DIAS_SEMANA[Number(filtros.dia_semana)] ?? "?"}`.replace("Chegou Sábado", "Chegou no sábado").replace("Chegou Domingo", "Chegou no domingo") });
  if (filtros.hora) chips.push({ chave: "hora", texto: `Entre ${filtros.hora}h e ${Number(filtros.hora) + 1}h` });
  if (filtros.interesse) chips.push({ chave: "interesse", texto: `Interesse: ${filtros.interesse === "-" ? "não identificado" : filtros.interesse}` });
  if (filtros.novo) chips.push({ chave: "novo", texto: filtros.novo === "1" ? "Só leads novos" : "Só quem já era contato", dica: GLOSSARIO.leadsNovos });
  if (filtros.anuncio) chips.push({ chave: "anuncio", texto: filtros.anuncio === "-" ? "Sem anúncio" : `Anúncio: ${filtros.anuncio}`, dica: GLOSSARIO.anuncio });
  if (filtros.canal) chips.push({ chave: "canal", texto: `Canal: ${filtros.canal}` });
  if (filtros.fonte) chips.push({ chave: "fonte", texto: `Fonte: ${filtros.fonte}` });
  if (filtros.etiqueta_id) chips.push({ chave: "etiqueta", texto: `Etiqueta: ${etiquetas.data?.find((e) => e.id === filtros.etiqueta_id)?.nome ?? "…"}` });
  if (!chips.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-sm">
      <span className="font-medium text-accent-ink">Mostrando:</span>
      {chips.map((c) => (
        <span key={c.chave} className="inline-flex items-center gap-1">
          <Chip onRemover={() => definir({ [c.chave]: undefined })}>{c.texto}</Chip>
          {c.dica && <Dica texto={c.dica} />}
        </span>
      ))}
      <button
        onClick={() => definir(Object.fromEntries(chips.map((c) => [c.chave, undefined])))}
        className="ml-auto text-xs text-accent-ink hover:underline cursor-pointer"
      >
        Limpar recorte
      </button>
    </div>
  );
}
