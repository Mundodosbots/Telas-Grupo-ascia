import type { ReactNode } from "react";
import { useAtendentes, useChatbots, useDepartamentos, useEtiquetas, useFiltros, useOrigens, useTimes, PERIODOS } from "../hooks";
import { SITUACOES } from "../lib/glossario";
import { Campo, cx, Selecao } from "./ui";

type Extra = "atendente" | "time" | "departamento" | "origem" | "etiqueta" | "canal" | "cidade" | "busca" | "humano";

/** Barra de filtros única. Tudo fica na URL (dá para mandar o link com o filtro). */
export function BarraFiltros({ extras = [] }: { extras?: Extra[] }) {
  const { filtros, definir } = useFiltros();
  const chatbots = useChatbots();
  const atendentes = useAtendentes();
  const times = useTimes();
  const departamentos = useDepartamentos();
  const origens = useOrigens();
  const etiquetas = useEtiquetas();
  const tem = (e: Extra) => extras.includes(e);

  return (
    <div className="mb-5 grid gap-3 print:hidden">
      {(chatbots.data?.length ?? 0) > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chatbot">
          <Pilula ativo={!filtros.chatbot_id} onClick={() => definir({ chatbot: undefined })}>
            Todos os chatbots
          </Pilula>
          {chatbots.data!.map((c) => (
            <Pilula key={c.id} ativo={filtros.chatbot_id === c.id} cor={c.cor} onClick={() => definir({ chatbot: c.id })}>
              {c.nome}
            </Pilula>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Selecao rotulo="Período" value={filtros.periodo} onChange={(e) => definir({ periodo: e.target.value })} className="w-44">
          {PERIODOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.rotulo}
            </option>
          ))}
        </Selecao>
        {filtros.periodo === "custom" && (
          <>
            <Campo rotulo="De" type="date" value={filtros.inicio ?? ""} onChange={(e) => definir({ inicio: e.target.value })} className="w-40" />
            <Campo rotulo="Até" type="date" value={filtros.fim ?? ""} onChange={(e) => definir({ fim: e.target.value })} className="w-40" />
          </>
        )}
        {tem("atendente") && (
          <Selecao rotulo="Atendente" value={filtros.atendente_id ?? ""} onChange={(e) => definir({ atendente: e.target.value })} className="w-52">
            <option value="">Todos</option>
            {(atendentes.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Selecao>
        )}
        {tem("time") && (times.data?.length ?? 0) > 0 && (
          <Selecao rotulo="Time" value={filtros.time_id ?? ""} onChange={(e) => definir({ time: e.target.value })} className="w-44">
            <option value="">Todos</option>
            {times.data!.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </Selecao>
        )}
        {tem("departamento") && (
          <Selecao rotulo="Departamento" value={filtros.departamento_id ?? ""} onChange={(e) => definir({ departamento: e.target.value })} className="w-48">
            <option value="">Todos</option>
            <option value="nenhum">Sem departamento</option>
            {(departamentos.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </Selecao>
        )}
        {tem("origem") && (
          <Selecao rotulo="Origem" value={filtros.origem_id ?? ""} onChange={(e) => definir({ origem: e.target.value })} className="w-52">
            <option value="">Todas</option>
            <option value="nenhuma">Sem origem</option>
            {(origens.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
        )}
        {tem("etiqueta") && (
          <Selecao rotulo="Etiqueta" value={filtros.etiqueta_id ?? ""} onChange={(e) => definir({ etiqueta: e.target.value })} className="w-44">
            <option value="">Todas</option>
            {(etiquetas.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
        )}
        {tem("cidade") && (
          <Campo
            key={`cidade-${filtros.cidade ?? ""}`}
            rotulo="Cidade"
            placeholder="Ex.: Sinop"
            defaultValue={filtros.cidade ?? ""}
            onKeyDown={(e) => e.key === "Enter" && definir({ cidade: (e.target as HTMLInputElement).value.trim() })}
            onBlur={(e) => e.target.value.trim() !== (filtros.cidade ?? "") && definir({ cidade: e.target.value.trim() })}
            className="w-36"
          />
        )}
        {tem("busca") && (
          <Campo
            key={`busca-${filtros.busca ?? ""}`}
            rotulo="Buscar"
            placeholder="Nome, telefone, protocolo ou resumo"
            defaultValue={filtros.busca ?? ""}
            onKeyDown={(e) => e.key === "Enter" && definir({ busca: (e.target as HTMLInputElement).value })}
            onBlur={(e) => e.target.value !== (filtros.busca ?? "") && definir({ busca: e.target.value })}
            className="w-64"
          />
        )}
        {tem("humano") && (
          <Selecao
            rotulo="Situação"
            value={filtros.situacao ?? (filtros.humano === "1" ? "humano" : "")}
            onChange={(e) => definir({ situacao: e.target.value, humano: undefined })}
            className="w-60"
          >
            <option value="">Todas</option>
            {SITUACOES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.rotulo}
              </option>
            ))}
          </Selecao>
        )}
      </div>
    </div>
  );
}

function Pilula({ ativo, cor, onClick, children }: { ativo: boolean; cor?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 h-8 text-sm transition-colors cursor-pointer",
        ativo ? "border-ink bg-ink text-surface font-medium" : "border-line bg-surface text-ink-2 hover:text-ink hover:border-muted",
      )}
    >
      {cor && <span className="size-2.5 rounded-full" style={{ background: cor }} />}
      {children}
    </button>
  );
}
