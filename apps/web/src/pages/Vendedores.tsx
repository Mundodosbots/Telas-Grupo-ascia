import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Merge, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api, type Vendedor } from "../api";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, Campo, Cartao, Carregando, cx, Modal, Ponto, Selecao, Vazio } from "../components/ui";
import { useEmpresas, useVendedores } from "../hooks";
import { dataHora, numero } from "../lib/formato";

export function PaginaVendedores() {
  const vendedores = useVendedores();
  const empresas = useEmpresas();
  const [empresa, setEmpresa] = useState("");
  const [editando, setEditando] = useState<Vendedor | "novo" | null>(null);
  const [mesclando, setMesclando] = useState<Vendedor | null>(null);

  const lista = (vendedores.data ?? []).filter((v) => !empresa || v.empresaId === empresa);

  return (
    <>
      <Titulo
        titulo="Vendedores"
        descricao="Criados automaticamente quando o bot atribui alguém novo. Se o mesmo vendedor aparecer com dois nomes, use “Mesclar”."
        acoes={
          <Botao variante="primario" onClick={() => setEditando("novo")}>
            <Plus className="size-4" /> Novo vendedor
          </Botao>
        }
      />
      <div className="mb-3">
        <Selecao rotulo="Empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="w-60">
          <option value="">Todas</option>
          {(empresas.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Selecao>
      </div>
      <Cartao>
        {!vendedores.data ? (
          <Carregando />
        ) : !lista.length ? (
          <Vazio titulo="Nenhum vendedor ainda">Eles aparecem aqui quando o chatbot fizer a primeira atribuição.</Vazio>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-2 py-2 font-medium">Empresa</th>
                  <th className="px-2 py-2 text-right font-medium">Atendimentos</th>
                  <th className="px-2 py-2 text-right font-medium">Última atribuição</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {lista.map((v) => (
                  <tr key={v.id} className={cx("border-b border-line last:border-0", !v.ativo && "opacity-60")}>
                    <td className="px-4 py-2.5">
                      <Link to={`/atendimentos?vendedor=${v.id}&periodo=tudo`} className="font-medium hover:underline">
                        {v.nome}
                      </Link>
                      {!v.ativo && <span className="ml-2 text-xs text-muted">(inativo)</span>}
                      {(v.email || v.idExterno || v.apelidos.length > 0) && (
                        <p className="text-xs text-muted">
                          {[v.email, v.idExterno && `ID ${v.idExterno}`, v.apelidos.length > 0 && `também: ${v.apelidos.join(", ")}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        <Ponto cor={v.empresaCor} className="size-2" /> {v.empresaNome}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium tabular">{numero(v.atendimentos)}</td>
                    <td className="px-2 py-2.5 text-right text-xs text-ink-2 tabular">{dataHora(v.ultimaAtribuicao)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Botao variante="fantasma" onClick={() => setEditando(v)} aria-label={`Editar ${v.nome}`}>
                          <Pencil className="size-4" />
                        </Botao>
                        <Botao variante="fantasma" onClick={() => setMesclando(v)} title="Mesclar com outro vendedor">
                          <Merge className="size-4" />
                        </Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
      {editando && <FormVendedor vendedor={editando === "novo" ? null : editando} onFechar={() => setEditando(null)} />}
      {mesclando && <FormMesclar vendedor={mesclando} todos={vendedores.data ?? []} onFechar={() => setMesclando(null)} />}
    </>
  );
}

function FormVendedor({ vendedor, onFechar }: { vendedor: Vendedor | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const empresas = useEmpresas();
  const [nome, setNome] = useState(vendedor?.nome ?? "");
  const [email, setEmail] = useState(vendedor?.email ?? "");
  const [idExterno, setIdExterno] = useState(vendedor?.idExterno ?? "");
  const [empresaId, setEmpresaId] = useState(vendedor?.empresaId ?? empresas.data?.[0]?.id ?? "");
  const [ativo, setAtivo] = useState(vendedor?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () =>
      vendedor
        ? api(`/vendedores/${vendedor.id}`, { method: "PATCH", body: { nome, email, id_externo: idExterno, ativo } })
        : api(`/vendedores`, { method: "POST", body: { nome, email, id_externo: idExterno, empresa_id: empresaId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendedores"] });
      onFechar();
    },
    onError: (e) => setErro((e as Error).message),
  });
  return (
    <Modal titulo={vendedor ? `Editar ${vendedor.nome}` : "Novo vendedor"} aberto onFechar={onFechar}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        {erro && <Alerta>{erro}</Alerta>}
        {!vendedor && (
          <Selecao id="vend-empresa" rotulo="Empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            {(empresas.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Selecao>
        )}
        <Campo id="vend-nome" rotulo="Nome (igual ao que o bot envia)" required value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo id="vend-email" rotulo="E-mail (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo
          id="vend-ext"
          rotulo="ID no chatbot (opcional)"
          value={idExterno}
          onChange={(e) => setIdExterno(e.target.value)}
          ajuda="Se o bot mandar “vendedor_id”, o vínculo é feito por ele, mesmo que o nome mude."
        />
        {vendedor && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Botao type="button" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primario" carregando={salvar.isPending}>
            Salvar
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function FormMesclar({ vendedor, todos, onFechar }: { vendedor: Vendedor; todos: Vendedor[]; onFechar: () => void }) {
  const qc = useQueryClient();
  const candidatos = todos.filter((v) => v.empresaId === vendedor.empresaId && v.id !== vendedor.id);
  const [destino, setDestino] = useState(candidatos[0]?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const mesclar = useMutation({
    mutationFn: () => api(`/vendedores/${vendedor.id}/mesclar`, { method: "POST", body: { destino_id: destino } }),
    onSuccess: () => {
      qc.invalidateQueries();
      onFechar();
    },
    onError: (e) => setErro((e as Error).message),
  });
  const alvo = candidatos.find((c) => c.id === destino);
  return (
    <Modal titulo={`Mesclar “${vendedor.nome}”`} aberto onFechar={onFechar}>
      <div className="grid gap-4">
        {erro && <Alerta>{erro}</Alerta>}
        {!candidatos.length ? (
          <p className="text-sm text-muted">Não há outro vendedor na {vendedor.empresaNome} para mesclar.</p>
        ) : (
          <>
            <Selecao id="mesclar-destino" rotulo="Juntar com" value={destino} onChange={(e) => setDestino(e.target.value)}>
              {candidatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.atendimentos})
                </option>
              ))}
            </Selecao>
            <Alerta tipo="aviso">
              Os {numero(vendedor.atendimentos)} atendimento(s) de “{vendedor.nome}” passam para “{alvo?.nome}”, e “{vendedor.nome}” deixa de existir. Se
              o bot mandar “{vendedor.nome}” de novo, o sistema já reconhece como “{alvo?.nome}”. Não dá para desfazer.
            </Alerta>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={!destino} onClick={() => mesclar.mutate()} carregando={mesclar.isPending}>
            Mesclar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
