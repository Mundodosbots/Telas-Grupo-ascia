import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { Link } from "react-router";
import { api, qs, type AtendimentoItem, type Pagina } from "../api";
import { BarraFiltros } from "../components/Filtros";
import { Titulo } from "../components/Layout";
import { Alerta, Cartao, Carregando, Chip, Paginacao, Ponto, Selecao, StatusBadge, Vazio } from "../components/ui";
import { useFiltros } from "../hooks";
import { dataHora, telefone } from "../lib/formato";

const OPCOES_STATUS = [
  { v: "", r: "Todos" },
  { v: "revisar,erro", r: "A revisar" },
  { v: "pendente,processando", r: "Na fila da IA" },
  { v: "classificado", r: "Classificados pela IA" },
  { v: "manual", r: "Conferidos" },
];

export function PaginaAtendimentos() {
  const { filtros, definir, pagina } = useFiltros();
  const consulta = qs({
    empresa_id: filtros.empresa_id,
    inicio: filtros.inicio,
    fim: filtros.fim,
    vendedor_id: filtros.vendedor_id,
    origem_id: filtros.origem_id,
    etiqueta_id: filtros.etiqueta_id,
    status: filtros.status,
    busca: filtros.busca,
    pagina,
    por_pagina: 25,
  });
  const q = useQuery({
    queryKey: ["atendimentos", consulta],
    queryFn: () => api<Pagina<AtendimentoItem>>(`/atendimentos${consulta}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <Titulo titulo="Atendimentos" descricao="Cada linha é um cliente atribuído. Se ele foi repassado, aparece com o último vendedor." />
      <BarraFiltros extras={["vendedor", "origem", "etiqueta", "busca"]} />
      <div className="mb-3 flex items-end gap-3">
        <Selecao rotulo="Situação" value={filtros.status ?? ""} onChange={(e) => definir({ status: e.target.value })} className="w-52">
          {OPCOES_STATUS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.r}
            </option>
          ))}
        </Selecao>
      </div>
      <Cartao>
        {q.error && <Alerta>{(q.error as Error).message}</Alerta>}
        {!q.data ? (
          <Carregando />
        ) : q.data.itens.length === 0 ? (
          <Vazio titulo="Nenhum atendimento encontrado">Ajuste os filtros acima.</Vazio>
        ) : (
          <>
            <TabelaAtendimentos itens={q.data.itens} />
            <Paginacao pagina={q.data.pagina} porPagina={q.data.porPagina} total={q.data.total} onPagina={(p) => definir({ pagina: String(p) })} />
          </>
        )}
      </Cartao>
    </>
  );
}

export function TabelaAtendimentos({ itens }: { itens: AtendimentoItem[] }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[860px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="min-w-44 px-4 py-2 font-medium">Cliente</th>
            <th className="px-2 py-2 font-medium">Vendedor</th>
            <th className="px-2 py-2 font-medium">Origem</th>
            <th className="px-2 py-2 font-medium">Etiquetas</th>
            <th className="px-2 py-2 font-medium">Situação</th>
            <th className="px-4 py-2 text-right font-medium">Última atribuição</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((a) => (
            <tr key={a.id} className="border-b border-line last:border-0 hover:bg-surface-2">
              <td className="px-4 py-2.5">
                <Link to={`/atendimentos/${a.id}`} className="block min-w-0">
                  <span className="block font-medium text-ink hover:underline">{a.clienteNome}</span>
                  <span className="block whitespace-nowrap text-xs text-muted tabular">{telefone(a.clienteTelefone)}</span>
                </Link>
              </td>
              <td className="px-2 py-2.5">
                <span className="flex items-center gap-2">
                  <Ponto cor={a.empresaCor} className="size-2" />
                  <span>
                    <span className="block">{a.vendedorNome}</span>
                    <span className="block text-xs text-muted">{a.empresaNome}</span>
                  </span>
                  {a.totalAtribuicoes > 1 && (
                    <span title={`Atribuído ${a.totalAtribuicoes} vezes`} className="inline-flex items-center gap-0.5 text-xs text-muted tabular">
                      <Repeat className="size-3" />
                      {a.totalAtribuicoes}
                    </span>
                  )}
                </span>
              </td>
              <td className="px-2 py-2.5">
                {a.origemNome ? (
                  <Chip cor={a.origemCor}>{a.origemNome}</Chip>
                ) : a.sugestao ? (
                  <span className="text-xs text-muted" title="Sugestão da IA">
                    Sugestão: “{a.sugestao}”
                  </span>
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
              </td>
              <td className="px-2 py-2.5">
                <div className="flex max-w-56 flex-wrap gap-1">
                  {a.etiquetas.map((e) => (
                    <Chip key={e.id} cor={e.cor}>
                      {e.nome}
                    </Chip>
                  ))}
                </div>
              </td>
              <td className="px-2 py-2.5">
                <StatusBadge status={a.status} />
              </td>
              <td className="px-4 py-2.5 text-right text-xs text-ink-2 tabular whitespace-nowrap">{dataHora(a.ultimaAtribuicaoEm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
