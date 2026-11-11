import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { api, type Papel, type UsuarioLista } from "../api";
import { useAuth } from "../auth";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, Campo, Cartao, Carregando, cx, Modal, Selecao } from "../components/ui";
import { dataHora } from "../lib/formato";

export function PaginaUsuarios() {
  const q = useQuery({ queryKey: ["usuarios"], queryFn: () => api<UsuarioLista[]>("/usuarios") });
  const [editando, setEditando] = useState<UsuarioLista | "novo" | null>(null);
  return (
    <>
      <Titulo
        titulo="Usuários"
        descricao="Só você (master) cria contas. Gerentes veem tudo, corrigem classificações e mantêm os cadastros."
        acoes={
          <Botao variante="primario" onClick={() => setEditando("novo")}>
            <Plus className="size-4" /> Novo usuário
          </Botao>
        }
      />
      <Cartao>
        {!q.data ? (
          <Carregando />
        ) : (
          <ul className="-mx-4 divide-y divide-line">
            {q.data.map((u) => (
              <li key={u.id} className={cx("flex items-center gap-3 px-4 py-3", !u.ativo && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {u.nome} <span className="ml-1 text-xs font-normal text-muted">{u.papel === "master" ? "Master" : "Gerente"}</span>
                    {!u.ativo && <span className="ml-1 text-xs font-normal text-bad">bloqueado</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {u.email} · último acesso {dataHora(u.ultimoLoginEm)}
                  </p>
                </div>
                <Botao variante="fantasma" onClick={() => setEditando(u)} aria-label={`Editar ${u.nome}`}>
                  <Pencil className="size-4" />
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      {editando && <FormUsuario usuario={editando === "novo" ? null : editando} onFechar={() => setEditando(null)} />}
    </>
  );
}

function FormUsuario({ usuario, onFechar }: { usuario: UsuarioLista | null; onFechar: () => void }) {
  const { usuario: eu } = useAuth();
  const qc = useQueryClient();
  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<Papel>(usuario?.papel ?? "gerente");
  const [ativo, setAtivo] = useState(usuario?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const souEu = usuario?.id === eu?.id;
  const salvar = useMutation({
    mutationFn: () =>
      usuario
        ? api(`/usuarios/${usuario.id}`, { method: "PATCH", body: { nome, papel, ativo, ...(senha && { senha }) } })
        : api(`/usuarios`, { method: "POST", body: { nome, email, senha, papel } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      onFechar();
    },
    onError: (e) => setErro((e as Error).message),
  });
  return (
    <Modal titulo={usuario ? `Editar ${usuario.nome}` : "Novo usuário"} aberto onFechar={onFechar}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        {erro && <Alerta>{erro}</Alerta>}
        <Campo id="usr-nome" rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo id="usr-email" rotulo="E-mail (login)" type="email" required disabled={!!usuario} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo
          id="usr-senha"
          rotulo={usuario ? "Nova senha (deixe vazio para manter)" : "Senha inicial"}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required={!usuario}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          ajuda="Mínimo de 8 caracteres. A pessoa pode trocar depois em “Minha senha”."
        />
        <Selecao id="usr-papel" rotulo="Perfil" value={papel} disabled={souEu} onChange={(e) => setPapel(e.target.value as Papel)}>
          <option value="gerente">Gerente</option>
          <option value="master">Master (pode criar contas e tokens)</option>
        </Selecao>
        {usuario && !souEu && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Acesso liberado
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
