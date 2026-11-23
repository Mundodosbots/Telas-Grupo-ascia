import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, LogIn, Plus } from "lucide-react";
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
  const [limpando, setLimpando] = useState<Empresa | null>(null);
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
                <Botao variante="perigo" onClick={() => setLimpando(e)} title="Apagar contatos, atendimentos e envios recebidos">
                  <Eraser className="size-4" /> Apagar dados recebidos
                </Botao>
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
      {limpando && <FormLimpar empresa={limpando} onFechar={() => setLimpando(null)} />}
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

type ResultadoLimpeza = { contatos: number; atendimentos: number; envios: number; atendentes: number };

/** Apaga o que veio da plataforma para recomeçar a contagem. Pede o nome da empresa para confirmar. */
function FormLimpar({ empresa, onFechar }: { empresa: Empresa; onFechar: () => void }) {
  const qc = useQueryClient();
  const [confirmacao, setConfirmacao] = useState("");
  const [comAtendentes, setComAtendentes] = useState(true);
  const limpar = useMutation({
    mutationFn: () => api<ResultadoLimpeza>(`/empresas/${empresa.id}/limpar`, { method: "POST", body: { confirmacao, atendentes: comAtendentes } }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const confere = confirmacao.trim().toLowerCase() === empresa.nome.trim().toLowerCase();
  return (
    <Modal titulo={`Apagar dados recebidos de ${empresa.nome}`} aberto onFechar={onFechar}>
      {limpar.data ? (
        <div className="grid gap-3">
          <Alerta tipo="ok">
            Pronto. Apagados: {numero(limpar.data.contatos)} contato(s), {numero(limpar.data.atendimentos)} atendimento(s), {numero(limpar.data.envios)} envio(s)
            {limpar.data.atendentes ? ` e ${numero(limpar.data.atendentes)} atendente(s)` : ""}. Os próximos envios da plataforma começam do zero.
          </Alerta>
          <div className="flex justify-end">
            <Botao variante="primario" onClick={onFechar}>
              Fechar
            </Botao>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (confere) limpar.mutate();
          }}
        >
          <Alerta tipo="erro">Isto não tem volta. Os dados apagados não podem ser recuperados.</Alerta>
          <div className="grid gap-1">
            <p className="font-medium text-ink">Vai apagar:</p>
            <p className="text-ink-2">contatos, atendimentos, conversas, tempos, classificações da IA e a lista de envios recebidos ({numero(empresa.atendimentos)} atendimento(s) hoje).</p>
            <p className="mt-1 font-medium text-ink">Fica como está:</p>
            <p className="text-ink-2">chatbots e tokens (a plataforma continua enviando normalmente), usuários, origens, departamentos, etiquetas, regras de origem e times.</p>
          </div>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 size-4" checked={comAtendentes} onChange={(e) => setComAtendentes(e.target.checked)} />
            <span>
              Apagar também os atendentes
              <span className="block text-xs text-muted">Eles são criados de novo sozinhos nos próximos envios. Desmarque para manter times e mesclas já feitas.</span>
            </span>
          </label>
          {limpar.error && <Alerta>{(limpar.error as Error).message}</Alerta>}
          <Campo rotulo={`Para confirmar, digite o nome da empresa: ${empresa.nome}`} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="off" />
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="fantasma" onClick={onFechar}>
              Cancelar
            </Botao>
            <Botao variante="perigo" disabled={!confere} carregando={limpar.isPending}>
              <Eraser className="size-4" /> Apagar dados
            </Botao>
          </div>
        </form>
      )}
    </Modal>
  );
}
