import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, type Regra } from "../api";
import { ehAdmin, useAuth } from "../auth";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, Campo, Cartao, Carregando, Chip, cx, Modal, Selecao, Vazio } from "../components/ui";
import { useOrigens } from "../hooks";
import { numero } from "../lib/formato";

const CAMPOS: Record<Regra["campo"], { nome: string; rotulo: string; exemplo: string }> = {
  etiqueta: { nome: "a etiqueta da plataforma", rotulo: "Nome da etiqueta", exemplo: "Grow" },
  anuncio: { nome: "a plataforma do anúncio (ADS Plataforma)", rotulo: "Plataforma", exemplo: "Instagram" },
  fonte: { nome: "a fonte do contato", rotulo: "Fonte", exemplo: "Ads" },
  canal: { nome: "o canal da conversa", rotulo: "Canal", exemplo: "Instagram" },
  texto: { nome: "o texto da conversa ou do anúncio", rotulo: "Trecho procurado", exemplo: "ADS_CLICKED" },
};

export function PaginaRegras() {
  const { usuario, empresa } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["regras", empresa?.id], queryFn: () => api<Regra[]>("/regras"), enabled: !!empresa });
  const [editando, setEditando] = useState<Regra | "nova" | null>(null);
  const pode = ehAdmin(usuario);
  const ordem = useMutation({ mutationFn: (ids: string[]) => api("/regras/ordem", { method: "POST", body: { ids } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["regras"] }) });
  const reaplicar = useMutation({ mutationFn: () => api<{ analisados: number; alterados: number }>("/regras/reaplicar", { method: "POST" }), onSuccess: () => qc.invalidateQueries() });
  const lista = q.data ?? [];
  const mover = (i: number, d: -1 | 1) => {
    const ids = lista.map((r) => r.id);
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    ordem.mutate(ids);
  };

  return (
    <>
      <Titulo
        titulo="Regras de origem"
        descricao="Quando uma regra bate, a origem é definida na hora, sem depender da IA. Vale a primeira de cima para baixo. Sem regra, a IA decide pela conversa."
        acoes={
          pode && (
            <>
              <Botao carregando={reaplicar.isPending} onClick={() => reaplicar.mutate()}>
                <RefreshCw className="size-4" /> Reaplicar (últimos 60 dias)
              </Botao>
              <Botao variante="primario" onClick={() => setEditando("nova")}>
                <Plus className="size-4" /> Nova regra
              </Botao>
            </>
          )
        }
      />
      {reaplicar.data && (
        <Alerta tipo="ok">
          {reaplicar.data.analisados} atendimento(s) analisado(s), {reaplicar.data.alterados} mudaram de origem.
        </Alerta>
      )}
      <Cartao className="mt-3">
        {q.isLoading ? (
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
                    Se <b>{CAMPOS[r.campo]?.nome ?? r.campo}</b>
                    {r.comparacao === "contem" || r.campo === "texto" ? " contém " : " for "}
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{r.valor}</code>→<Chip cor={r.origemCor}>{r.origemNome}</Chip>
                    {!r.ativo && <span className="text-xs text-muted">(desativada)</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">definiu a origem de {numero(r.uso)} atendimento(s)</p>
                </div>
                {pode && (
                  <div className="flex gap-1">
                    <button disabled={i === 0} onClick={() => mover(i, -1)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30 cursor-pointer" aria-label="Subir">
                      <ArrowUp className="size-4" />
                    </button>
                    <button disabled={i === lista.length - 1} onClick={() => mover(i, 1)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30 cursor-pointer" aria-label="Descer">
                      <ArrowDown className="size-4" />
                    </button>
                    <button onClick={() => setEditando(r)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 cursor-pointer" aria-label="Editar">
                      <Pencil className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">
          As etiquetas e os dados de anúncio acumulam o histórico do contato. Por isso as regras valem para o atendimento mais recente de cada envio, e a ordem importa.
        </p>
      </Cartao>
      {editando && <FormRegra regra={editando === "nova" ? null : editando} onFechar={() => setEditando(null)} />}
    </>
  );
}

function FormRegra({ regra, onFechar }: { regra: Regra | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const origens = useOrigens();
  const [campo, setCampo] = useState<Regra["campo"]>(regra?.campo ?? "etiqueta");
  const [comparacao, setComparacao] = useState<Regra["comparacao"]>(regra?.comparacao ?? "igual");
  const [valor, setValor] = useState(regra?.valor ?? "");
  const [origemId, setOrigemId] = useState(regra?.origemId ?? "");
  const [ativo, setAtivo] = useState(regra?.ativo ?? true);
  const [confirmar, setConfirmar] = useState(false);
  const fim = () => {
    qc.invalidateQueries({ queryKey: ["regras"] });
    onFechar();
  };
  const salvar = useMutation({
    mutationFn: () => {
      const body = { campo, comparacao: campo === "texto" ? "contem" : comparacao, valor, origem_id: origemId, ...(regra && { ativo }) };
      return regra ? api(`/regras/${regra.id}`, { method: "PATCH", body }) : api("/regras", { method: "POST", body });
    },
    onSuccess: fim,
  });
  const excluir = useMutation({ mutationFn: () => api(`/regras/${regra!.id}`, { method: "DELETE" }), onSuccess: fim });
  const c = CAMPOS[campo];
  return (
    <Modal titulo={regra ? "Editar regra" : "Nova regra"} aberto onFechar={onFechar}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (origemId) salvar.mutate();
        }}
      >
        {(salvar.error || excluir.error) && <Alerta>{((salvar.error ?? excluir.error) as Error).message}</Alerta>}
        <div className="grid grid-cols-2 gap-3">
          <Selecao rotulo="Quando" value={campo} onChange={(e) => setCampo(e.target.value as Regra["campo"])}>
            {Object.entries(CAMPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.nome}
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="Comparação" value={campo === "texto" ? "contem" : comparacao} disabled={campo === "texto"} onChange={(e) => setComparacao(e.target.value as Regra["comparacao"])}>
            <option value="igual">for igual a</option>
            <option value="contem">contiver</option>
          </Selecao>
        </div>
        <Campo rotulo={c.rotulo} required value={valor} onChange={(e) => setValor(e.target.value)} placeholder={c.exemplo} ajuda="Sem diferença entre maiúsculas, minúsculas e acentos." />
        <Selecao rotulo="A origem é" required value={origemId} onChange={(e) => setOrigemId(e.target.value)}>
          <option value="">Escolha…</option>
          {(origens.data ?? []).filter((o) => o.ativo || o.id === origemId).map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Selecao>
        {regra && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativa
          </label>
        )}
        <div className="flex justify-between gap-2">
          {regra ? (
            confirmar ? (
              <Botao type="button" variante="perigo" carregando={excluir.isPending} onClick={() => excluir.mutate()}>
                Confirmar exclusão
              </Botao>
            ) : (
              <Botao type="button" variante="fantasma" onClick={() => setConfirmar(true)}>
                <Trash2 className="size-4" /> Excluir
              </Botao>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Botao type="button" variante="fantasma" onClick={onFechar}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvar.isPending}>
              Salvar
            </Botao>
          </div>
        </div>
      </form>
    </Modal>
  );
}
