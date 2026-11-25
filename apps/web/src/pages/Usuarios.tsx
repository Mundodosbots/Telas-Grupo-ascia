import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { api, type Papel, type UsuarioLista } from "../api";
import { useAuth } from "../auth";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, Campo, Cartao, Carregando, cx, Modal, Selecao } from "../components/ui";
import { useChatbots } from "../hooks";
import { dataHora } from "../lib/formato";

const NOME_PAPEL: Record<Papel, string> = { superadmin: "Superadmin", admin: "Administrador", gerente: "Gerente" };

export function PaginaUsuarios() {
  const { usuario, empresa } = useAuth();
  const superadmin = usuario?.papel === "superadmin";
  const [aba, setAba] = useState<"empresa" | "superadmins">("empresa");
  const caminho = aba === "superadmins" ? "/usuarios?superadmins=1" : "/usuarios";
  const q = useQuery({ queryKey: ["usuarios", aba, empresa?.id], queryFn: () => api<UsuarioLista[]>(caminho) });
  const [editando, setEditando] = useState<UsuarioLista | "novo" | null>(null);
  const chatbots = useChatbots();
  const nomeChatbot = new Map((chatbots.data ?? []).map((c) => [c.id, c.nome]));
  return (
    <>
      <Titulo
        titulo="Usuários"
        descricao="Administradores veem a empresa toda, criam usuários e mexem nos cadastros. Gerentes veem o painel, os atendimentos e os relatórios: de todos os chatbots ou só dos que você escolher (ex.: o gerente e os vendedores da Fiat veem só a Fiat)."
        acoes={
          <Botao variante="primario" onClick={() => setEditando("novo")}>
            <Plus className="size-4" /> Novo usuário
          </Botao>
        }
      />
      {superadmin && (
        <div className="mb-3 flex gap-1.5">
          {(["empresa", "superadmins"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={cx("h-8 rounded-full border px-3 text-sm cursor-pointer", aba === a ? "border-ink bg-ink text-surface" : "border-line text-ink-2")}
            >
              {a === "empresa" ? `Usuários de ${empresa?.nome ?? "…"}` : "Superadmins da plataforma"}
            </button>
          ))}
        </div>
      )}
      <Cartao>
        {q.error ? (
          <Alerta>{(q.error as Error).message}</Alerta>
        ) : !q.data ? (
          <Carregando />
        ) : (
          <ul className="-mx-4 divide-y divide-line">
            {q.data.map((u) => (
              <li key={u.id} className={cx("flex items-center gap-3 px-4 py-3", !u.ativo && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {u.nome} <span className="ml-1 text-xs font-normal text-muted">{NOME_PAPEL[u.papel]}</span>
                    {!u.ativo && <span className="ml-1 text-xs font-normal text-bad">bloqueado</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {u.email} · último acesso {dataHora(u.ultimoLoginEm)}
                  </p>
                  {u.papel === "gerente" && (
                    <p className="mt-0.5 text-xs text-ink-2">
                      {u.chatbotIds ? (
                        <>
                          Vê só: <strong className="font-medium">{u.chatbotIds.map((id) => nomeChatbot.get(id) ?? "chatbot removido").join(", ")}</strong>
                        </>
                      ) : (
                        "Vê todos os chatbots"
                      )}
                    </p>
                  )}
                </div>
                <Botao variante="fantasma" onClick={() => setEditando(u)} aria-label={`Editar ${u.nome}`}>
                  <Pencil className="size-4" />
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      {editando && <FormUsuario usuario={editando === "novo" ? null : editando} superadmins={aba === "superadmins"} onFechar={() => setEditando(null)} />}
    </>
  );
}

function FormUsuario({ usuario, superadmins, onFechar }: { usuario: UsuarioLista | null; superadmins: boolean; onFechar: () => void }) {
  const { usuario: eu } = useAuth();
  const qc = useQueryClient();
  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<Papel>(usuario?.papel ?? (superadmins ? "superadmin" : "gerente"));
  const [ativo, setAtivo] = useState(usuario?.ativo ?? true);
  const chatbots = useChatbots();
  const [limitado, setLimitado] = useState(!!usuario?.chatbotIds);
  const [escolhidos, setEscolhidos] = useState<string[]>(usuario?.chatbotIds ?? []);
  const chatbotIds = papel === "gerente" && limitado ? escolhidos : null;
  const salvar = useMutation({
    mutationFn: () =>
      usuario
        ? api(`/usuarios/${usuario.id}`, {
            method: "PATCH",
            body: { nome, ativo, ...(usuario.papel !== "superadmin" && { papel, chatbot_ids: chatbotIds }), ...(senha && { senha }) },
          })
        : api("/usuarios", { method: "POST", body: { nome, email, senha, papel, ...(papel !== "superadmin" && { chatbot_ids: chatbotIds }) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      onFechar();
    },
  });
  const souEu = usuario?.id === eu?.id;
  return (
    <Modal titulo={usuario ? `Editar ${usuario.nome}` : "Novo usuário"} aberto onFechar={onFechar}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        {salvar.error && <Alerta>{(salvar.error as Error).message}</Alerta>}
        <Campo rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo="E-mail" type="email" required disabled={!!usuario} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo
          rotulo={usuario ? "Nova senha (deixe em branco para manter)" : "Senha inicial"}
          type="password"
          required={!usuario}
          minLength={8}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        {papel !== "superadmin" && (
          <Selecao rotulo="Papel" value={papel} disabled={souEu} onChange={(e) => setPapel(e.target.value as Papel)}>
            <option value="gerente">Gerente — vê painel, atendimentos e relatórios</option>
            <option value="admin">Administrador — vê a empresa toda, cria usuários e mexe nos cadastros</option>
          </Selecao>
        )}
        {papel === "gerente" && (
          <fieldset className="grid gap-2 rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-medium">Chatbots que pode ver</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="acesso" checked={!limitado} onChange={() => setLimitado(false)} /> Todos os chatbots da empresa
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="acesso" checked={limitado} onChange={() => setLimitado(true)} /> Só os chatbots escolhidos
            </label>
            {limitado && (
              <div className="ml-6 grid gap-1.5">
                {(chatbots.data ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={escolhidos.includes(c.id)}
                      onChange={(e) => setEscolhidos((atual) => (e.target.checked ? [...atual, c.id] : atual.filter((x) => x !== c.id)))}
                    />
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
                    {c.nome}
                    {!c.ativo && <span className="text-xs text-muted">(desativado)</span>}
                  </label>
                ))}
                {chatbots.data?.length === 0 && <p className="text-xs text-muted">A empresa ainda não tem chatbots.</p>}
                <p className="text-xs text-muted">Ele não vê nada dos outros chatbots: atendimentos, painel, relatórios, atendentes nem assistente.</p>
              </div>
            )}
          </fieldset>
        )}
        {usuario && !souEu && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Acesso liberado
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" carregando={salvar.isPending} disabled={papel === "gerente" && limitado && !escolhidos.length}>
            Salvar
          </Botao>
        </div>
      </form>
    </Modal>
  );
}
