import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, type Regra } from "../api";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, Campo, Cartao, Carregando, Chip, cx, Modal, Selecao, Vazio } from "../components/ui";
import { useEmpresas, useOrigens } from "../hooks";
import { numero } from "../lib/formato";

const useRegras = () => useQuery({ queryKey: ["regras"], queryFn: () => api<Regra[]>("/regras") });

/** Regras fixas de origem: valem antes da IA, de cima para baixo */
export function PaginaRegras() {
  const qc = useQueryClient();
  const regras = useRegras();
  const [editando, setEditando] = useState<Regra | "nova" | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const ordenar = useMutation({
    mutationFn: (ids: string[]) => api("/regras/ordem", { method: "POST", body: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regras"] }),
  });
  const reaplicar = useMutation({
    mutationFn: () => api<{ analisados: number; alterados: number }>("/regras/reaplicar", { method: "POST" }),
    onSuccess: (r) => {
      setResultado(`${numero(r.analisados)} atendimento(s) analisados, ${numero(r.alterados)} alterado(s).`);
      qc.invalidateQueries({ queryKey: ["atendimentos"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["regras"] });
    },
  });

  const lista = regras.data ?? [];
  const mover = (i: number, d: -1 | 1) => {
    const ids = lista.map((r) => r.id);
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    ordenar.mutate(ids);
  };

  return (
    <>
      <Titulo
        titulo="Regras de origem"
        descricao="Quando uma regra bate, a origem é definida na hora, sem depender da IA. Vale a primeira de cima para baixo. Sem regra, a IA decide pelo resumo."
        acoes={
          <>
            <Botao onClick={() => reaplicar.mutate()} carregando={reaplicar.isPending} title="Aplica as regras de novo nos atendimentos que ainda não foram conferidos">
              <RefreshCw className="size-4" /> Reaplicar nos atendimentos
            </Botao>
            <Botao variante="primario" onClick={() => setEditando("nova")}>
              <Plus className="size-4" /> Nova regra
            </Botao>
          </>
        }
      />
      {resultado && (
        <div className="mb-3">
          <Alerta tipo="ok">{resultado}</Alerta>
        </div>
      )}
      <Cartao>
        {!regras.data ? (
          <Carregando />
        ) : !lista.length ? (
          <Vazio titulo="Nenhuma regra">Crie uma regra como “etiqueta Grow → RPA Grow”.</Vazio>
        ) : (
          <ol className="-mx-4 divide-y divide-line">
            {lista.map((r, i) => (
              <li key={r.id} className={cx("flex flex-wrap items-center gap-3 px-4 py-3", !r.ativo && "opacity-60")}>
                <span className="w-6 text-center text-xs font-semibold text-muted tabular">{i + 1}º</span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex flex-wrap items-center gap-1.5">
                    Se a <b>{r.campo === "fonte" ? "fonte do contato" : "etiqueta da plataforma"}</b>
                    {r.comparacao === "contem" ? " contém " : " for "}
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{r.valor}</code>→<Chip cor={r.origemCor}>{r.origemNome}</Chip>
                    {!r.ativo && <span className="text-xs text-muted">(desativada)</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {r.empresaNome ?? "Todas as empresas"} · definiu a origem de {numero(r.uso)} atendimento(s)
                  </p>
                </div>
                <div className="flex gap-1">
                  <Botao variante="fantasma" disabled={i === 0 || ordenar.isPending} onClick={() => mover(i, -1)} aria-label="Subir prioridade">
                    <ArrowUp className="size-4" />
                  </Botao>
                  <Botao variante="fantasma" disabled={i === lista.length - 1 || ordenar.isPending} onClick={() => mover(i, 1)} aria-label="Descer prioridade">
                    <ArrowDown className="size-4" />
                  </Botao>
                  <Botao variante="fantasma" onClick={() => setEditando(r)} aria-label="Editar regra">
                    <Pencil className="size-4" />
                  </Botao>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Cartao>
      <p className="mt-3 max-w-3xl text-xs text-muted">
        As etiquetas da plataforma acumulam o histórico do contato: um cliente que veio de uma campanha antiga continua com aquela etiqueta. Por isso, coloque no topo
        as regras mais confiáveis (como Grow) e evite regras muito genéricas.
      </p>
      {editando && <FormRegra regra={editando === "nova" ? null : editando} onFechar={() => setEditando(null)} />}
    </>
  );
}

function FormRegra({ regra, onFechar }: { regra: Regra | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const origens = useOrigens();
  const empresas = useEmpresas();
  const [campo, setCampo] = useState<Regra["campo"]>(regra?.campo ?? "etiqueta");
  const [comparacao, setComparacao] = useState<Regra["comparacao"]>(regra?.comparacao ?? "igual");
  const [valor, setValor] = useState(regra?.valor ?? "");
  const [origemId, setOrigemId] = useState(regra?.origemId ?? "");
  const [empresaId, setEmpresaId] = useState(regra?.empresaId ?? "");
  const [ativo, setAtivo] = useState(regra?.ativo ?? true);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Sugestões de etiquetas: o dicionário importado da empresa escolhida (ou da primeira)
  const empresaSugestao = empresaId || empresas.data?.[0]?.id;
  const dicionario = useQuery({
    queryKey: ["dicionario", empresaSugestao],
    queryFn: () => api<{ id: string; nome: string }[]>(`/empresas/${empresaSugestao}/etiquetas-plataforma`),
    enabled: !!empresaSugestao && campo === "etiqueta",
  });

  const fim = () => {
    qc.invalidateQueries({ queryKey: ["regras"] });
    onFechar();
  };
  const salvar = useMutation({
    mutationFn: () => {
      const body = { campo, comparacao, valor, origem_id: origemId, empresa_id: empresaId || null, ...(regra && { ativo }) };
      return regra ? api(`/regras/${regra.id}`, { method: "PATCH", body }) : api("/regras", { method: "POST", body });
    },
    onSuccess: fim,
    onError: (e) => setErro((e as Error).message),
  });
  const excluir = useMutation({
    mutationFn: () => api(`/regras/${regra!.id}`, { method: "DELETE" }),
    onSuccess: fim,
    onError: (e) => setErro((e as Error).message),
  });

  return (
    <Modal titulo={regra ? "Editar regra" : "Nova regra"} aberto onFechar={onFechar}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!origemId) return setErro("Escolha a origem.");
          salvar.mutate();
        }}
      >
        {erro && <Alerta>{erro}</Alerta>}
        <div className="grid grid-cols-2 gap-3">
          <Selecao id="regra-campo" rotulo="Quando" value={campo} onChange={(e) => setCampo(e.target.value as Regra["campo"])}>
            <option value="etiqueta">a etiqueta da plataforma</option>
            <option value="fonte">a fonte do contato</option>
          </Selecao>
          <Selecao id="regra-comparacao" rotulo="Comparação" value={comparacao} onChange={(e) => setComparacao(e.target.value as Regra["comparacao"])}>
            <option value="igual">for igual a</option>
            <option value="contem">contiver</option>
          </Selecao>
        </div>
        <Campo
          id="regra-valor"
          rotulo={campo === "etiqueta" ? "Nome da etiqueta" : "Texto da fonte"}
          required
          list="regra-sugestoes"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={campo === "etiqueta" ? "Grow" : "API"}
          ajuda="Sem diferença entre maiúsculas, minúsculas e acentos."
        />
        <datalist id="regra-sugestoes">
          {(dicionario.data ?? []).map((t) => (
            <option key={t.id} value={t.nome} />
          ))}
        </datalist>
        <Selecao id="regra-origem" rotulo="Então a origem é" value={origemId} onChange={(e) => setOrigemId(e.target.value)}>
          <option value="">Escolha…</option>
          {(origens.data ?? [])
            .filter((o) => o.ativo || o.id === origemId)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
        </Selecao>
        <Selecao id="regra-empresa" rotulo="Vale para" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
          <option value="">Todas as empresas</option>
          {(empresas.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              Só {e.nome}
            </option>
          ))}
        </Selecao>
        {regra && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativa
          </label>
        )}
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {regra ? (
            confirmarExclusao ? (
              <Botao type="button" variante="perigo" onClick={() => excluir.mutate()} carregando={excluir.isPending}>
                Confirmar exclusão
              </Botao>
            ) : (
              <Botao type="button" variante="perigo" onClick={() => setConfirmarExclusao(true)}>
                <Trash2 className="size-4" /> Excluir
              </Botao>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Botao type="button" onClick={onFechar}>
              Cancelar
            </Botao>
            <Botao type="submit" variante="primario" carregando={salvar.isPending}>
              Salvar
            </Botao>
          </div>
        </div>
      </form>
    </Modal>
  );
}
