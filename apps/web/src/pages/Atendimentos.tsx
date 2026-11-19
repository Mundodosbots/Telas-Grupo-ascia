import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api, qs, type AtendimentoItem, type Pagina } from "../api";
import { useAuth } from "../auth";
import { BarraFiltros } from "../components/Filtros";
import { Titulo } from "../components/Layout";
import { Alerta, Cartao, Carregando, Chip, cx, Paginacao, Ponto, Vazio } from "../components/ui";
import { useFiltros } from "../hooks";
import { dataHora, duracao, numero, telefone } from "../lib/formato";

const POR_PAGINA = 25;

export function PaginaAtendimentos() {
  const { consulta, definir, pagina } = useFiltros();
  const { empresa } = useAuth();
  const navegar = useNavigate();
  const q = qs({ ...consulta, pagina, por_pagina: POR_PAGINA });
  const lista = useQuery({
    queryKey: ["atendimentos", empresa?.id, q],
    queryFn: () => api<Pagina<AtendimentoItem>>(`/atendimentos${q}`),
    placeholderData: (a) => a,
    enabled: !!empresa,
  });

  return (
    <>
      <Titulo titulo="Atendimentos" descricao="Cada linha é um atendimento (um protocolo). Clique para ver a conversa, os tempos e de onde o cliente veio." />
      <BarraFiltros extras={["atendente", "departamento", "origem", "etiqueta", "cidade", "busca", "humano"]} />
      <Cartao>
        {lista.error ? (
          <Alerta>{(lista.error as Error).message}</Alerta>
        ) : !lista.data ? (
          <Carregando />
        ) : !lista.data.itens.length ? (
          <Vazio titulo="Nenhum atendimento neste filtro" />
        ) : (
          <>
            <p className="mb-2 text-xs text-muted">{numero(lista.data.total)} atendimento(s)</p>
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Início</th>
                    <th className="px-3 py-2 font-medium">Atendente</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium">Departamento</th>
                    <th className="px-3 py-2 text-right font-medium">Robô → humano</th>
                    <th className="px-4 py-2 text-right font-medium">Resp. média</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.data.itens.map((a) => (
                    <tr key={a.id} onClick={() => navegar(`/atendimentos/${a.id}`)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-2">
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
                      <td className="px-3 py-2.5">{a.origemNome ? <Chip cor={a.origemCor}>{a.origemNome}</Chip> : <span className="text-muted">{a.status === "pendente" || a.status === "processando" ? "IA analisando…" : "—"}</span>}</td>
                      <td className="px-3 py-2.5">{a.departamentoNome ? <Chip cor={a.departamentoCor}>{a.departamentoNome}</Chip> : <span className="text-muted">—</span>}</td>
                      <td className={cx("px-3 py-2.5 text-right tabular", a.semHumano && "text-bad", a.atendidoAte30 === false && !a.semHumano && "text-warn")}>
                        {a.semHumano ? "sem humano" : duracao(a.tempoAteHumanoS)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">
                        {duracao(a.tempoMedioRespostaS)}
                        {a.esperasAcima30 > 0 && <span className="ml-1 text-xs text-bad">({a.esperasAcima30}×&gt;30)</span>}
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
