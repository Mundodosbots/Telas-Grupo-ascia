import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { api, type ItemCadastro } from "../api";
import { ehAdmin, useAuth } from "../auth";
import { Titulo } from "../components/Layout";
import { Alerta, AreaTexto, Botao, Campo, Cartao, Carregando, cx, Modal, Ponto, SeletorCor, Vazio } from "../components/ui";
import { useDepartamentos, useEtiquetas, useOrigens } from "../hooks";
import { numero, PALETA } from "../lib/formato";

type Tipo = "origens" | "departamentos" | "etiquetas";

const TEXTOS: Record<Tipo, { titulo: string; descricao: string; novo: string; exemploNome: string; exemploDescricao: string }> = {
  origens: {
    titulo: "Origens",
    descricao: "De onde o cliente veio. As regras decidem primeiro; o que sobrar, a IA escolhe pelo nome e pela descrição — escreva como explicaria para um vendedor novo.",
    novo: "Nova origem",
    exemploNome: "Feirão de sábado",
    exemploDescricao: "Cliente veio por causa do feirão de sábado (convite, panfleto, rádio).",
  },
  departamentos: {
    titulo: "Departamentos",
    descricao: "O assunto que o cliente procura (Vendas, Seminovos, Peças, Pós-venda…). A IA escolhe um por atendimento a partir da conversa.",
    novo: "Novo departamento",
    exemploNome: "Consórcio",
    exemploDescricao: "Cliente quer saber de consórcio, cartas de crédito ou lances.",
  },
  etiquetas: {
    titulo: "Etiquetas",
    descricao: "Marcações extras sobre o atendimento (interesse, perfil, situação). A IA pode aplicar várias por atendimento.",
    novo: "Nova etiqueta",
    exemploNome: "Interesse em SUV",
    exemploDescricao: "Cliente perguntou por SUVs ou modelos maiores.",
  },
};

export function PaginaCadastro({ tipo }: { tipo: Tipo }) {
  const t = TEXTOS[tipo];
  const { usuario } = useAuth();
  const consultas = { origens: useOrigens(), departamentos: useDepartamentos(), etiquetas: useEtiquetas() };
  const q = consultas[tipo];
  const [editando, setEditando] = useState<ItemCadastro | "novo" | null>(null);
  const [verInativos, setVerInativos] = useState(false);
  const pode = ehAdmin(usuario);
  const itens = (q.data ?? []).filter((i) => verInativos || i.ativo);

  return (
    <>
      <Titulo
        titulo={t.titulo}
        descricao={t.descricao}
        acoes={
          pode && (
            <Botao variante="primario" onClick={() => setEditando("novo")}>
              <Plus className="size-4" /> {t.novo}
            </Botao>
          )
        }
      />
      <Cartao>
        {q.isLoading ? (
          <Carregando />
        ) : !itens.length ? (
          <Vazio titulo="Nada cadastrado" />
        ) : (
          <ul className="-mx-4 divide-y divide-line">
            {itens.map((i) => (
              <li key={i.id} className={cx("flex items-start gap-3 px-4 py-3", !i.ativo && "opacity-60")}>
                <Ponto cor={i.cor} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {i.nome} {!i.ativo && <span className="text-xs font-normal text-muted">(desativado)</span>}
                  </p>
                  {i.descricao && <p className="mt-0.5 text-sm text-muted">{i.descricao}</p>}
                </div>
                <span className="text-xs text-muted tabular whitespace-nowrap">{numero(i.uso)} uso(s)</span>
                {pode && (
                  <button onClick={() => setEditando(i)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer" aria-label="Editar">
                    <Pencil className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {(q.data ?? []).some((i) => !i.ativo) && (
          <label className="mt-3 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={verInativos} onChange={(e) => setVerInativos(e.target.checked)} /> Mostrar desativados
          </label>
        )}
      </Cartao>
      {editando && <FormItem tipo={tipo} item={editando === "novo" ? null : editando} onFechar={() => setEditando(null)} />}
    </>
  );
}

function FormItem({ tipo, item, onFechar }: { tipo: Tipo; item: ItemCadastro | null; onFechar: () => void }) {
  const t = TEXTOS[tipo];
  const qc = useQueryClient();
  const [nome, setNome] = useState(item?.nome ?? "");
  const [descricao, setDescricao] = useState(item?.descricao ?? "");
  const [cor, setCor] = useState(item?.cor ?? PALETA[0]!);
  const [ativo, setAtivo] = useState(item?.ativo ?? true);
  const salvar = useMutation({
    mutationFn: () =>
      item
        ? api(`/${tipo}/${item.id}`, { method: "PATCH", body: { nome, descricao, cor, ativo } })
        : api(`/${tipo}`, { method: "POST", body: { nome, descricao, cor } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [tipo] });
      onFechar();
    },
  });
  return (
    <Modal titulo={item ? `Editar: ${item.nome}` : t.novo} aberto onFechar={onFechar}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        {salvar.error && <Alerta>{(salvar.error as Error).message}</Alerta>}
        <Campo rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t.exemploNome} />
        <AreaTexto rotulo="Descrição (a IA lê)" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={t.exemploDescricao} />
        <SeletorCor valor={cor} onChange={setCor} paleta={PALETA} />
        {item && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo (desativado some das opções da IA)
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" carregando={salvar.isPending}>
            Salvar
          </Botao>
        </div>
      </form>
    </Modal>
  );
}
