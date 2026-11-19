import { useMutation } from "@tanstack/react-query";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Grafico, type RespostaAssistente } from "../api";
import { useAuth } from "../auth";
import { PALETA } from "../lib/formato";
import { Markdown } from "./Markdown";
import { cx } from "./ui";

type Msg = { papel: "usuario" | "assistente"; texto: string; grafico?: Grafico | null };

const SUGESTOES = [
  "Qual atendente mais demora para responder?",
  "Quem mais transfere atendimentos?",
  "Quantos leads ficaram sem atendimento humano esta semana?",
  "De onde vieram os leads este mês?",
];

/** Assistente de IA: balão flutuante no canto inferior direito */
export function Assistente() {
  const { empresa } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const perguntar = useMutation({
    mutationFn: (pergunta: string) =>
      api<RespostaAssistente>("/assistente", { method: "POST", body: { pergunta, historico: msgs.map(({ papel, texto }) => ({ papel, texto })) } }),
    onSuccess: (r) => setMsgs((m) => [...m, { papel: "assistente", texto: r.texto, grafico: r.grafico }]),
    onError: (e) => setMsgs((m) => [...m, { papel: "assistente", texto: `Não consegui responder: ${(e as Error).message}` }]),
  });
  // Conversa nova ao trocar de empresa
  useEffect(() => {
    setMsgs([]);
  }, [empresa?.id]);
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, perguntar.isPending]);

  const enviar = (p: string) => {
    const pergunta = p.trim();
    if (!pergunta || perguntar.isPending) return;
    setMsgs((m) => [...m, { papel: "usuario", texto: pergunta }]);
    setTexto("");
    perguntar.mutate(pergunta);
  };

  return (
    <div className="print:hidden">
      {aberto && (
        <section
          aria-label="Assistente"
          className="fixed bottom-20 right-4 z-50 flex h-[min(620px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        >
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Sparkles className="size-4 text-accent" />
            <p className="flex-1 text-sm font-semibold">Assistente do painel</p>
            {msgs.length > 0 && (
              <button onClick={() => setMsgs([])} className="text-xs text-muted hover:text-ink cursor-pointer">
                Nova conversa
              </button>
            )}
            <button onClick={() => setAberto(false)} className="rounded-md p-1 text-muted hover:bg-surface-2 cursor-pointer" aria-label="Fechar">
              <X className="size-4" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {!msgs.length && (
              <div className="grid gap-2">
                <p className="text-sm text-ink-2">Pergunte sobre os atendimentos de {empresa?.nome}: tempos, atendentes, origens, departamentos…</p>
                {SUGESTOES.map((s) => (
                  <button key={s} onClick={() => enviar(s)} className="rounded-lg border border-line px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2 cursor-pointer">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-3">
              {msgs.map((m, i) => (
                <div key={i} className={cx("flex", m.papel === "usuario" ? "justify-end" : "justify-start")}>
                  <div className={cx("max-w-[92%] rounded-2xl px-3 py-2 text-sm", m.papel === "usuario" ? "rounded-br-sm bg-accent text-white" : "rounded-bl-sm bg-surface-2 text-ink")}>
                    {m.papel === "usuario" ? m.texto : <Markdown texto={m.texto} />}
                    {m.grafico && m.grafico.dados.length > 0 && <GraficoResposta g={m.grafico} />}
                  </div>
                </div>
              ))}
              {perguntar.isPending && <p className="text-sm text-muted">Consultando os dados…</p>}
              <div ref={fim} />
            </div>
          </div>
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pergunte algo…"
              className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm"
              aria-label="Pergunta"
            />
            <button disabled={!texto.trim() || perguntar.isPending} className="grid size-10 place-items-center rounded-lg bg-accent text-white disabled:opacity-50 cursor-pointer" aria-label="Enviar">
              <Send className="size-4" />
            </button>
          </form>
        </section>
      )}
      <button
        onClick={() => setAberto(!aberto)}
        className="fixed bottom-4 right-4 z-50 grid size-13 place-items-center rounded-full bg-accent text-white shadow-lg hover:brightness-110 cursor-pointer"
        aria-label={aberto ? "Fechar assistente" : "Abrir assistente"}
      >
        {aberto ? <X className="size-5" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}

function GraficoResposta({ g }: { g: Grafico }) {
  const dados = g.dados.slice(0, 20);
  const dica = { contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }, formatter: (v: number) => [`${v} ${g.unidade}`, ""] };
  return (
    <div className="mt-2 rounded-lg bg-surface p-2">
      <p className="mb-1 text-xs font-medium text-ink-2">{g.titulo}</p>
      <div style={{ height: g.tipo === "barras" ? Math.max(140, dados.length * 26) : 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          {g.tipo === "pizza" ? (
            <PieChart>
              <Pie data={dados} dataKey="valor" nameKey="rotulo" innerRadius={40} outerRadius={70} paddingAngle={2}>
                {dados.map((_, i) => (
                  <Cell key={i} fill={PALETA[i % PALETA.length]} />
                ))}
              </Pie>
              <Tooltip {...dica} formatter={(v: number, n: string) => [`${v} ${g.unidade}`, n]} />
            </PieChart>
          ) : g.tipo === "linha" ? (
            <LineChart data={dados} margin={{ left: -20, right: 8, top: 4 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="rotulo" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis tickLine={false} axisLine={false} fontSize={10} />
              <Tooltip {...dica} />
              <Line dataKey="valor" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          ) : (
            <BarChart data={dados} layout="vertical" margin={{ left: 0, right: 12 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="rotulo" width={110} tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip {...dica} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="valor" fill="var(--accent)" radius={[0, 3, 3, 0]} maxBarSize={18} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
