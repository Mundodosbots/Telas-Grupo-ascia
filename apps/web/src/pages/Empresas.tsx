import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogIn, Plus } from "lucide-react";
import { useState } from "react";
import { api, type Empresa } from "../api";
import { useAuth } from "../auth";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, Campo, Cartao, Carregando, Modal, Vazio } from "../components/ui";
import { dataHora, numero } from "../lib/formato";

/** Empresas clientes do SaaS — só o superadmin */
export function PaginaEmpresas() {
  const { trocarEmpresa, recarregarPerfil, empresa } = useAuth();
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["empresas-saas"], queryFn: () => api<Empresa[]>("/empresas") });
  const [nova, setNova] = useState(false);
  const alternar = useMutation({
    mutationFn: (e: Empresa) => api(`/empresas/${e.id}`, { method: "PATCH", body: { ativo: !e.ativo } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empresas-saas"] });
      recarregarPerfil();
    },
  });

  return (
    <>
      <Titulo
        titulo="Empresas"
        descricao="Clientes do painel. Cada empresa tem seus chatbots, usuários e cadastros, e não vê os dados das outras."
        acoes={
          <Botao variante="primario" onClick={() => setNova(true)}>
            <Plus className="size-4" /> Nova empresa
          </Botao>
        }
      />
      {!empresa && <Alerta tipo="info">Escolha uma empresa no menu (ou clique em "Entrar") para ver o painel dela.</Alerta>}
      <Cartao className="mt-3">
        {lista.isLoading ? (
          <Carregando />
        ) : !lista.data?.length ? (
          <Vazio titulo="Nenhuma empresa ainda">Crie a primeira empresa (ex.: Grupo Asia) com o administrador dela.</Vazio>
        ) : (
          <ul className="-mx-4 divide-y divide-line">
            {lista.data.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {e.nome} {!e.ativo && <span className="text-xs font-normal text-bad">(desativada)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {numero(e.chatbots)} chatbot(s) · {numero(e.usuarios)} usuário(s) · {numero(e.atendimentos)} atendimento(s)
                    {e.ultimoEvento ? ` · último envio ${dataHora(e.ultimoEvento)}` : " · nenhum envio ainda"}
                  </p>
                </div>
                <Botao variante="fantasma" carregando={alternar.isPending && alternar.variables?.id === e.id} onClick={() => alternar.mutate(e)}>
                  {e.ativo ? "Desativar" : "Reativar"}
                </Botao>
                <Botao onClick={() => trocarEmpresa(e.id)}>
                  <LogIn className="size-4" /> Entrar
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      {nova && <FormEmpresa onFechar={() => setNova(false)} />}
    </>
  );
}

function FormEmpresa({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient();
  const { recarregarPerfil } = useAuth();
  const [nome, setNome] = useState("");
  const [admin, setAdmin] = useState({ nome: "", email: "", senha: "" });
  const salvar = useMutation({
    mutationFn: () => api("/empresas", { method: "POST", body: { nome, admin } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empresas-saas"] });
      recarregarPerfil();
      onFechar();
    },
  });
  return (
    <Modal titulo="Nova empresa" aberto onFechar={onFechar}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        {salvar.error && <Alerta>{(salvar.error as Error).message}</Alerta>}
        <Campo rotulo="Nome da empresa" required minLength={2} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Grupo Via Norte" />
        <p className="text-xs font-medium text-ink-2">Administrador da empresa (cria os outros usuários dela)</p>
        <Campo rotulo="Nome" required value={admin.nome} onChange={(e) => setAdmin({ ...admin, nome: e.target.value })} />
        <Campo rotulo="E-mail" type="email" required value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
        <Campo rotulo="Senha inicial" type="password" required minLength={8} value={admin.senha} onChange={(e) => setAdmin({ ...admin, senha: e.target.value })} ajuda="Mínimo 8 caracteres. A pessoa troca em Minha senha." />
        <p className="text-xs text-muted">A empresa já nasce com origens, departamentos, etiquetas e regras padrão (Grow, anúncio Instagram/Facebook, fonte Ads).</p>
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" carregando={salvar.isPending}>
            Criar empresa
          </Botao>
        </div>
      </form>
    </Modal>
  );
}
