import type { ReactNode } from "react";
import { useEmpresas, useEtiquetas, useFiltros, useOrigens, useVendedores, PERIODOS } from "../hooks";
import { Campo, cx, Selecao } from "./ui";

/** Barra de filtros única, acima dos gráficos/listas. Tudo fica na URL. */
export function BarraFiltros({ extras = [] }: { extras?: ("vendedor" | "origem" | "etiqueta" | "busca")[] }) {
  const { filtros, definir } = useFiltros();
  const empresas = useEmpresas();
  const vendedores = useVendedores();
  const origens = useOrigens();
  const etiquetas = useEtiquetas();

  const vendedoresVisiveis = (vendedores.data ?? []).filter((v) => !filtros.empresa_id || v.empresaId === filtros.empresa_id);

  return (
    <div className="mb-5 grid gap-3">
      {/* Empresa: botões segmentados — é o filtro mais usado */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Empresa">
        <BotaoEmpresa ativo={!filtros.empresa_id} onClick={() => definir({ empresa: undefined, vendedor: undefined })}>
          Todas as empresas
        </BotaoEmpresa>
        {(empresas.data ?? []).map((e) => (
          <BotaoEmpresa key={e.id} ativo={filtros.empresa_id === e.id} cor={e.cor} onClick={() => definir({ empresa: e.id, vendedor: undefined })}>
            {e.nome}
          </BotaoEmpresa>
        ))}
      </div>

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
        {extras.includes("vendedor") && (
          <Selecao rotulo="Vendedor" value={filtros.vendedor_id ?? ""} onChange={(e) => definir({ vendedor: e.target.value })} className="w-52">
            <option value="">Todos</option>
            {vendedoresVisiveis.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
                {!filtros.empresa_id ? ` · ${v.empresaNome.replace("Asia ", "")}` : ""}
              </option>
            ))}
          </Selecao>
        )}
        {extras.includes("origem") && (
          <Selecao rotulo="Origem" value={filtros.origem_id ?? ""} onChange={(e) => definir({ origem: e.target.value })} className="w-52">
            <option value="">Todas</option>
            <option value="nenhuma">Sem origem identificada</option>
            {(origens.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
        )}
        {extras.includes("etiqueta") && (
          <Selecao rotulo="Etiqueta" value={filtros.etiqueta_id ?? ""} onChange={(e) => definir({ etiqueta: e.target.value })} className="w-44">
            <option value="">Todas</option>
            {(etiquetas.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
        )}
        {extras.includes("busca") && (
          <Campo
            rotulo="Buscar"
            placeholder="Nome, telefone ou texto do resumo"
            defaultValue={filtros.busca ?? ""}
            onKeyDown={(e) => e.key === "Enter" && definir({ busca: (e.target as HTMLInputElement).value })}
            onBlur={(e) => e.target.value !== (filtros.busca ?? "") && definir({ busca: e.target.value })}
            className="w-64"
          />
        )}
      </div>
    </div>
  );
}

function BotaoEmpresa({ ativo, cor, onClick, children }: { ativo: boolean; cor?: string; onClick: () => void; children: ReactNode }) {
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
