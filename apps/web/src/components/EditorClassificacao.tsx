import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { api, type EtiquetaMini, type ItemCadastro, type StatusClassificacao } from "../api";
import { useEtiquetas, useOrigens } from "../hooks";
import { PALETA } from "../lib/formato";
import { Alerta, Botao, cx, Ponto, Selecao } from "./ui";

type Props = {
  atendimento: {
    id: string;
    empresaId: string;
    origemId: string | null;
    status: StatusClassificacao;
    sugestao: string | null;
    etiquetas: EtiquetaMini[];
  };
  compacto?: boolean;
  onSalvo?: () => void;
};

/** Escolha manual de origem + etiquetas. Ao salvar, o atendimento fica "Conferido" e a IA não mexe mais. */
export function EditorClassificacao({ atendimento: a, compacto, onSalvo }: Props) {
  const qc = useQueryClient();
  const origens = useOrigens();
  const etiquetas = useEtiquetas();
  const [origemId, setOrigemId] = useState<string>(a.origemId ?? "");
  const [tags, setTags] = useState<Set<string>>(new Set(a.etiquetas.map((e) => e.id)));
  const [erro, setErro] = useState<string | null>(null);

  const daEmpresa = (i: ItemCadastro) => i.ativo && (!i.empresaId || i.empresaId === a.empresaId);
  const listaOrigens = (origens.data ?? []).filter((o) => daEmpresa(o) || o.id === a.origemId);
  const listaEtiquetas = (etiquetas.data ?? []).filter((e) => daEmpresa(e) || tags.has(e.id));

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["atendimentos"] });
    qc.invalidateQueries({ queryKey: ["atendimento", a.id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["status"] });
  };

  const salvar = useMutation({
    mutationFn: () => api(`/atendimentos/${a.id}`, { method: "PATCH", body: { origem_id: origemId || null, etiqueta_ids: [...tags] } }),
    onSuccess: () => {
      invalidar();
      onSalvo?.();
    },
    onError: (e) => setErro((e as Error).message),
  });

  const criarSugerida = useMutation({
    mutationFn: () =>
      api<ItemCadastro>("/origens", {
        method: "POST",
        body: { nome: a.sugestao, descricao: `Criada a partir de sugestão da IA.`, cor: PALETA[(origens.data?.length ?? 0) % 8] },
      }),
    onSuccess: (nova) => {
      qc.invalidateQueries({ queryKey: ["origens"] });
      setOrigemId(nova.id);
    },
    onError: (e) => setErro((e as Error).message),
  });

  const reclassificar = useMutation({
    mutationFn: () => api(`/atendimentos/${a.id}/reclassificar`, { method: "POST" }),
    onSuccess: invalidar,
    onError: (e) => setErro((e as Error).message),
  });

  const alternar = (id: string) =>
    setTags((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="grid gap-3">
      {erro && <Alerta>{erro}</Alerta>}
      <div className="flex flex-wrap items-end gap-2">
        <Selecao rotulo="Origem" value={origemId} onChange={(e) => setOrigemId(e.target.value)} className={compacto ? "w-64" : "w-full max-w-sm"}>
          <option value="">Sem origem identificada</option>
          {listaOrigens.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Selecao>
        {a.sugestao && !a.origemId && !origemId && (
          <Botao onClick={() => criarSugerida.mutate()} carregando={criarSugerida.isPending} title="Cria esta origem no cadastro e já seleciona">
            <Plus className="size-4" /> Criar “{a.sugestao}”
          </Botao>
        )}
      </div>
      <div className="grid gap-1">
        <span className="text-xs font-medium text-ink-2">Etiquetas</span>
        <div className="flex flex-wrap gap-1.5">
          {listaEtiquetas.map((e) => {
            const on = tags.has(e.id);
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={on}
                onClick={() => alternar(e.id)}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs cursor-pointer transition-colors",
                  on ? "border-ink bg-surface-2 text-ink font-medium" : "border-line text-ink-2 hover:border-muted",
                )}
              >
                {on ? <Check className="size-3" /> : <Ponto cor={e.cor} className="size-2" />}
                {e.nome}
              </button>
            );
          })}
          {!listaEtiquetas.length && <span className="text-xs text-muted">Nenhuma etiqueta cadastrada.</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Botao variante="primario" onClick={() => salvar.mutate()} carregando={salvar.isPending}>
          <Check className="size-4" /> {a.status === "manual" ? "Salvar" : "Confirmar classificação"}
        </Botao>
        {!compacto && (
          <Botao variante="fantasma" onClick={() => reclassificar.mutate()} carregando={reclassificar.isPending} title="Manda de volta para a IA analisar">
            <Sparkles className="size-4" /> Pedir nova análise da IA
          </Botao>
        )}
      </div>
    </div>
  );
}
