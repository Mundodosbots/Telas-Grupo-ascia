import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api, type EtiquetaPlataforma } from "../api";
import { ehAdmin, useAuth } from "../auth";
import { Titulo } from "../components/Layout";
import { Alerta, Cartao, Carregando, cx, Ponto, Vazio } from "../components/ui";
import { useEtiquetasPlataforma } from "../hooks";
import { numero } from "../lib/formato";

/**
 * A plataforma manda só o número de cada etiqueta do contato (ex.: 583303).
 * Aqui a empresa dá nome aos números e escolhe quais aparecem em destaque na lista de atendimentos.
 */
export function PaginaEtiquetasPlataforma() {
  const q = useEtiquetasPlataforma();
  const { usuario } = useAuth();
  const pode = ehAdmin(usuario);
  const itens = q.data ?? [];
  const porChatbot = [...new Set(itens.map((e) => e.chatbotId))].map((id) => itens.filter((e) => e.chatbotId === id));

  return (
    <>
      <Titulo
        titulo="Etiquetas da plataforma"
        descricao="As etiquetas que o contato tem na plataforma (Grow, cidade, atendente…). O envio traz só o número de cada uma: dê o nome aqui e marque em destaque as que quer ver na lista de atendimentos."
      />
      <Alerta tipo="info">
        Para descobrir qual etiqueta é cada número, abra na plataforma um dos contatos de exemplo e veja as etiquetas dele. Uma etiqueta que aparece em
        vários contatos diferentes fica fácil de achar. Depois de dar nome, o filtro “Etiqueta da plataforma” aparece na lista de atendimentos.
      </Alerta>
      <div className="mt-4 grid gap-4">
        {q.isLoading ? (
          <Cartao>
            <Carregando />
          </Cartao>
        ) : !itens.length ? (
          <Cartao>
            <Vazio titulo="Nenhuma etiqueta recebida ainda">As etiquetas aparecem aqui quando chega um envio de contato que tem etiqueta na plataforma.</Vazio>
          </Cartao>
        ) : (
          porChatbot.map((lista) => (
            <Cartao
              key={lista[0]!.chatbotId}
              titulo={
                <span className="inline-flex items-center gap-2">
                  <Ponto cor={lista[0]!.chatbotCor} /> {lista[0]!.chatbotNome}
                </span>
              }
              acao={lista.some((e) => !e.nome.trim()) ? <span className="text-xs text-warn">{lista.filter((e) => !e.nome.trim()).length} sem nome</span> : undefined}
            >
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="px-4 py-2 font-medium">Número</th>
                      <th className="px-3 py-2 font-medium">Nome</th>
                      <th className="px-3 py-2 font-medium" title="Aparece como selo ao lado do nome do cliente na lista de atendimentos">
                        Destaque
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Contatos</th>
                      <th className="px-3 py-2 font-medium">Exemplos</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((e) => (
                      <Linha key={e.id} e={e} pode={pode} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Cartao>
          ))
        )}
      </div>
    </>
  );
}

function Linha({ e, pode }: { e: EtiquetaPlataforma; pode: boolean }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(e.nome);
  const salvar = useMutation({
    mutationFn: (dados: Partial<Pick<EtiquetaPlataforma, "nome" | "cor" | "destaque">>) => api(`/etiquetas-plataforma/${e.id}`, { method: "PATCH", body: dados }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etiquetas-plataforma"] });
      qc.invalidateQueries({ queryKey: ["atendimentos"] });
    },
  });
  const salvarNome = () => nome.trim() !== e.nome && salvar.mutate({ nome: nome.trim() });

  return (
    <tr className="border-b border-line/60 last:border-0">
      <td className="px-4 py-2 tabular text-muted">#{e.idExterno}</td>
      <td className="px-3 py-2">
        {pode ? (
          <input
            value={nome}
            onChange={(ev) => setNome(ev.target.value)}
            onBlur={salvarNome}
            onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
            placeholder="Dar nome (ex.: Grow)"
            maxLength={80}
            className={cx(
              "w-48 rounded-md border bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-accent",
              e.nome.trim() ? "border-line" : "border-warn/50",
            )}
            aria-label={`Nome da etiqueta ${e.idExterno}`}
          />
        ) : (
          e.nome || <span className="text-muted">sem nome</span>
        )}
        {salvar.error && <p className="mt-1 text-xs text-bad">{(salvar.error as Error).message}</p>}
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-2">
          <button
            type="button"
            disabled={!pode || salvar.isPending}
            onClick={() => salvar.mutate({ destaque: !e.destaque })}
            className={cx(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs cursor-pointer disabled:cursor-default",
              e.destaque ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-muted hover:text-ink",
            )}
            aria-pressed={e.destaque}
          >
            <Star className={cx("size-3", e.destaque && "fill-current")} /> {e.destaque ? "Em destaque" : "Destacar"}
          </button>
          {e.destaque && pode && (
            <input
              type="color"
              value={e.cor}
              onChange={(ev) => salvar.mutate({ cor: ev.target.value })}
              className="size-6 cursor-pointer rounded border border-line bg-transparent p-0"
              aria-label="Cor do selo"
            />
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular">
        {numero(e.contatos)}
        <span className="block text-[11px] text-muted">{numero(e.atendimentos)} atend.</span>
      </td>
      <td className="px-3 py-2 text-xs text-ink-2">{e.exemplos.join(", ") || <span className="text-muted">—</span>}</td>
      <td className="pr-3">
        {e.atendimentos > 0 && (
          <Link to={`/atendimentos?plataforma=${e.id}&periodo=tudo`} className="text-muted hover:text-ink" title="Ver os atendimentos com esta etiqueta">
            <ChevronRight className="size-4" />
          </Link>
        )}
      </td>
    </tr>
  );
}
