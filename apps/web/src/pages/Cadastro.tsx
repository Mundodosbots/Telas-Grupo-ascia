import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, type ItemCadastro } from "../api";
import { Titulo } from "../components/Layout";
import { Alerta, AreaTexto, Botao, Campo, Cartao, Carregando, cx, Modal, Ponto, Selecao, SeletorCor, Vazio } from "../components/ui";
import { useEmpresas, useEtiquetas, useOrigens } from "../hooks";
import { numero, PALETA } from "../lib/formato";

const TEXTOS = {
  origens: {
    titulo: "Origens",
    descricao:
      "De onde o cliente veio. A IA escolhe uma origem por atendimento usando o nome e a descrição — escreva a descrição como você explicaria para um vendedor novo.",
    novo: "Nova origem",
    exemploNome: "Campanha Leap Motors",
    exemploDescricao: "Cliente veio de propaganda da Leap Motors: anúncio do C10, evento de lançamento, test drive da marca.",
  },
  etiquetas: {
    titulo: "Etiquetas",
    descricao: "Marcações extras sobre o atendimento (interesse, perfil, situação). A IA pode aplicar várias por atendimento.",
    novo: "Nova etiqueta",
    exemploNome: "Interesse em SUV",
    exemploDescricao: "Cliente perguntou por SUVs ou modelos maiores.",
  },
};

export function PaginaCadastro({ tipo }: { tipo: "origens" | "etiquetas" }) {
  const t = TEXTOS[tipo];
  const origens = useOrigens();
  const etiquetas = useEtiquetas();
  const empresas = useEmpresas();
  const q = tipo === "origens" ? origens : etiquetas;
  const [editando, setEditando] = useState<ItemCadastro | "novo" | null>(null);
  const [verInativos, setVerInativos] = useState(false);

  const itens = (q.data ?? []).filter((i) => verInativos || i.ativo);
  const nomeEmpresa = (id: string | null) => (id ? (empresas.data?.find((e) => e.id === id)?.nome ?? "—") : "Todas as empresas");

  return (
    <>
      <Titulo
        titulo={t.titulo}
        descricao={t.descricao}
        acoes={
          <Botao variante="primario" onClick={() => setEditando("novo")}>
            <Plus className="size-4" /> {t.novo}
          </Botao>
        }
      />
      <Cartao>
        <label className="mb-2 flex w-fit items-center gap-2 pt-3 text-xs text-ink-2">
          <input type="checkbox" checked={verInativos} onChange={(e) => setVerInativos(e.target.checked)} /> Mostrar desativadas
        </label>
        {!q.data ? (
          <Carregando />
        ) : !itens.length ? (
          <Vazio titulo="Nada cadastrado ainda" />
        ) : (
          <ul className="-mx-4 divide-y divide-line">
            {itens.map((i) => (
              <li key={i.id} className={cx("flex items-start gap-3 px-4 py-3", !i.ativo && "opacity-60")}>
                <Ponto cor={i.cor} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {i.nome} {!i.ativo && <span className="text-xs font-normal text-muted">(desativada)</span>}
                  </p>
                  <p className="text-sm text-ink-2">{i.descricao || <span className="text-muted">Sem descrição</span>}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {nomeEmpresa(i.empresaId)} · usada em {numero(i.uso)} atendimento(s)
                  </p>
                </div>
                <Botao variante="fantasma" onClick={() => setEditando(i)} aria-label={`Editar ${i.nome}`}>
                  <Pencil className="size-4" />
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      {editando && (
        <FormCadastro
          tipo={tipo}
          item={editando === "novo" ? null : editando}
          titulo={editando === "novo" ? t.novo : `Editar ${editando.nome}`}
          exemplo={t}
          onFechar={() => setEditando(null)}
        />
      )}
    </>
  );
}

function FormCadastro({
  tipo,
  item,
  titulo,
  exemplo,
  onFechar,
}: {
  tipo: "origens" | "etiquetas";
  item: ItemCadastro | null;
  titulo: string;
  exemplo: { exemploNome: string; exemploDescricao: string };
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const empresas = useEmpresas();
  const [nome, setNome] = useState(item?.nome ?? "");
  const [descricao, setDescricao] = useState(item?.descricao ?? "");
  const [cor, setCor] = useState(item?.cor ?? PALETA[0]!);
  const [empresaId, setEmpresaId] = useState(item?.empresaId ?? "");
  const [ativo, setAtivo] = useState(item?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: () => {
      const body = { nome, descricao, cor, empresa_id: empresaId || null, ...(item && { ativo }) };
      return item ? api(`/${tipo}/${item.id}`, { method: "PATCH", body }) : api(`/${tipo}`, { method: "POST", body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [tipo] });
      onFechar();
    },
    onError: (e) => setErro((e as Error).message),
  });
  const excluir = useMutation({
    mutationFn: () => api(`/${tipo}/${item!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [tipo] });
      onFechar();
    },
    onError: (e) => setErro((e as Error).message),
  });
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  return (
    <Modal titulo={titulo} aberto onFechar={onFechar}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        {erro && <Alerta>{erro}</Alerta>}
        <Campo id="cad-nome" rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder={exemplo.exemploNome} />
        <AreaTexto
          id="cad-desc"
          rotulo="Descrição para a IA"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={exemplo.exemploDescricao}
          ajuda="Diga que palavras ou situações indicam esta opção. É isso que a IA lê para decidir."
        />
        <Selecao id="cad-empresa" rotulo="Vale para" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
          <option value="">Todas as empresas</option>
          {(empresas.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              Só {e.nome}
            </option>
          ))}
        </Selecao>
        <SeletorCor valor={cor} onChange={setCor} paleta={PALETA} />
        {item && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativa (desative para a IA parar de usar, sem perder o histórico)
          </label>
        )}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {item && tipo === "origens" && item.uso === 0 ? (
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
