import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LifeBuoy, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api, type Chatbot, type Horario } from "../api";
import { ehAdmin, useAuth } from "../auth";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, BotaoCopiar, Campo, Cartao, Carregando, cx, Modal, Ponto, SeletorCor, Vazio } from "../components/ui";
import { useChatbots } from "../hooks";
import { dataHora, numero, PALETA } from "../lib/formato";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const urlWebhook = () => `${window.location.origin}/api/webhook`;

export function PaginaChatbots() {
  const { usuario } = useAuth();
  const chatbots = useChatbots();
  const [editando, setEditando] = useState<Chatbot | "novo" | null>(null);
  const [link, setLink] = useState<{ nome: string; token: string } | null>(null);
  const qc = useQueryClient();
  const pode = ehAdmin(usuario);
  const gerar = useMutation({
    mutationFn: (c: Chatbot) => api<{ token: string }>(`/chatbots/${c.id}/token`, { method: "POST" }).then((r) => ({ nome: c.nome, token: r.token })),
    onSuccess: (r) => {
      setLink(r);
      qc.invalidateQueries({ queryKey: ["chatbots"] });
    },
  });

  return (
    <>
      <Titulo
        titulo="Chatbots"
        descricao="Cada conta/bot da plataforma tem seu próprio token. No fim do atendimento, o fluxo manda o contato completo para o painel (External Request POST, com o token no cabeçalho Authorization)."
        acoes={
          pode && (
            <Botao variante="primario" onClick={() => setEditando("novo")}>
              <Plus className="size-4" /> Novo chatbot
            </Botao>
          )
        }
      />
      {gerar.error && <Alerta>{(gerar.error as Error).message}</Alerta>}
      <Cartao>
        {chatbots.isLoading ? (
          <Carregando />
        ) : !chatbots.data?.length ? (
          <Vazio titulo="Nenhum chatbot ainda">Cadastre um chatbot para cada conta da plataforma (ex.: Asia Fiat, Asia Leap Motors).</Vazio>
        ) : (
          <ul className="-mx-4 divide-y divide-line">
            {chatbots.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Ponto cor={c.cor} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {c.nome} {!c.ativo && <span className="text-xs font-normal text-muted">(desativado)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {c.tokenPrefixo ? `Token gerado em ${dataHora(c.tokenGeradoEm)}` : <span className="text-warn">Sem token: gere o token para começar a receber</span>}
                    {c.contaExterna && ` · conta ${c.contaExterna}`}
                    {" · "}
                    {c.fuso}
                  </p>
                  <p className="text-xs text-muted">
                    Hoje: {numero(c.hoje)} envio(s){c.recusadosHoje > 0 && <span className="text-bad"> · {c.recusadosHoje} recusado(s)</span>}
                    {c.ultimoEvento && ` · último ${dataHora(c.ultimoEvento)}`} · {numero(c.atendimentos)} atendimento(s)
                  </p>
                </div>
                {pode && (
                  <div className="flex gap-2">
                    <Botao onClick={() => setEditando(c)}>
                      <Pencil className="size-4" /> Editar
                    </Botao>
                    <Botao
                      carregando={gerar.isPending && gerar.variables?.id === c.id}
                      onClick={() => {
                        if (!c.tokenPrefixo || confirm(`Gerar um token novo para "${c.nome}"? O token atual para de funcionar e é preciso trocar no cabeçalho do fluxo da plataforma.`)) gerar.mutate(c);
                      }}
                    >
                      <KeyRound className="size-4" /> {c.tokenPrefixo ? "Trocar token" : "Gerar token"}
                    </Botao>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao className="mt-5">
        <div className="flex flex-wrap items-center gap-3">
          <LifeBuoy className="size-5 text-accent" />
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            <b className="text-ink">Primeira vez configurando?</b> O passo a passo mostra os campos que a plataforma precisa ter, como montar o External Request e como testar.
          </p>
          <Link to="/como-configurar" className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-surface-2">
            Ver o passo a passo
          </Link>
        </div>
      </Cartao>

      {link && (
        <Modal titulo={`Conexão de ${link.nome}`} aberto onFechar={() => setLink(null)} largura="max-w-xl">
          <div className="grid gap-4">
            <Alerta tipo="aviso">Copie agora: por segurança, o token só aparece esta vez. Se perder, gere outro.</Alerta>
            <ValorCopiavel rotulo="Request Type" valor="POST" />
            <ValorCopiavel rotulo="Request URL" valor={urlWebhook()} />
            <div className="grid gap-2">
              <p className="text-xs font-medium text-ink-2">Cabeçalhos</p>
              <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
                <ValorCopiavel valor="Authorization" curto />
                <ValorCopiavel valor={`Bearer ${link.token}`} />
                <ValorCopiavel valor="Content-Type" curto />
                <ValorCopiavel valor="application/json" />
              </div>
            </div>
            <div className="flex justify-end">
              <Link to="/como-configurar" className="text-sm font-medium text-accent hover:underline">
                Ver o passo a passo completo
              </Link>
            </div>
          </div>
        </Modal>
      )}
      {editando && <FormChatbot chatbot={editando === "novo" ? null : editando} onFechar={() => setEditando(null)} />}
    </>
  );
}

function ValorCopiavel({ rotulo, valor, curto }: { rotulo?: string; valor: string; curto?: boolean }) {
  return (
    <div className="grid gap-1">
      {rotulo && <p className="text-xs font-medium text-ink-2">{rotulo}</p>}
      <div className="flex min-w-0 items-center gap-2 rounded-md bg-surface-2 py-1 pl-3 pr-1">
        <code className={cx("min-w-0 flex-1 text-xs", curto ? "whitespace-nowrap" : "break-all")}>{valor}</code>
        <BotaoCopiar texto={valor} />
      </div>
    </div>
  );
}

const textoDoDia =(h: Horario, dia: number) => (h[String(dia)] ?? []).map(([a, b]) => `${a}-${b}`).join(", ");
function lerHorario(textos: string[]): Horario | string {
  const h: Horario = {};
  for (const [dia, t] of textos.entries()) {
    const partes = t.split(",").map((x) => x.trim()).filter(Boolean);
    const faixas: [string, string][] = [];
    for (const p of partes) {
      const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(p);
      if (!m) return `${DIAS[dia]}: use o formato 07:30-11:30, 13:30-17:30`;
      faixas.push([`${m[1]!.padStart(2, "0")}:${m[2]}`, `${m[3]!.padStart(2, "0")}:${m[4]}`]);
    }
    if (faixas.length) h[String(dia)] = faixas;
  }
  return h;
}

function FormChatbot({ chatbot, onFechar }: { chatbot: Chatbot | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(chatbot?.nome ?? "");
  const [cor, setCor] = useState(chatbot?.cor ?? PALETA[0]!);
  const [fuso, setFuso] = useState(chatbot?.fuso ?? "America/Cuiaba");
  const [ativo, setAtivo] = useState(chatbot?.ativo ?? true);
  const [dias, setDias] = useState(() =>
    chatbot ? DIAS.map((_, i) => textoDoDia(chatbot.horario, i)) : ["", "07:30-11:30, 13:30-17:30", "07:30-11:30, 13:30-17:30", "07:30-11:30, 13:30-17:30", "07:30-11:30, 13:30-17:30", "07:30-11:30, 13:30-17:30", "07:30-11:30"],
  );
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: (horario: Horario) =>
      chatbot ? api(`/chatbots/${chatbot.id}`, { method: "PATCH", body: { nome, cor, fuso, horario, ativo } }) : api("/chatbots", { method: "POST", body: { nome, cor, fuso, horario } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chatbots"] });
      onFechar();
    },
  });
  return (
    <Modal titulo={chatbot ? `Editar ${chatbot.nome}` : "Novo chatbot"} aberto onFechar={onFechar} largura="max-w-xl">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const h = lerHorario(dias);
          if (typeof h === "string") return setErro(h);
          setErro(null);
          salvar.mutate(h);
        }}
      >
        {(erro || salvar.error) && <Alerta>{erro ?? (salvar.error as Error).message}</Alerta>}
        <Campo rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Asia Fiat" />
        <SeletorCor valor={cor} onChange={setCor} paleta={PALETA} />
        <Campo rotulo="Fuso dos horários do histórico" value={fuso} onChange={(e) => setFuso(e.target.value)} ajuda="O da conta na plataforma. Mato Grosso: America/Cuiaba · Brasília: America/Sao_Paulo" />
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-ink-2">Horário de atendimento humano (os tempos só contam dentro dele; vazio = sem atendimento)</p>
          {DIAS.map((d, i) => (
            <label key={d} className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2 text-sm">
              <span className="text-muted">{d}</span>
              <input
                value={dias[i]}
                onChange={(e) => setDias(dias.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="fechado"
                className="h-8 rounded-md border border-line bg-surface px-2 text-sm"
              />
            </label>
          ))}
        </div>
        {chatbot && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo (desativado recusa os envios)
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
