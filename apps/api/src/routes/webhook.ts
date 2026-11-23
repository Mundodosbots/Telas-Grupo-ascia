import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db/client";
import { chatbots, empresas, webhookEventos } from "../db/schema";
import { contato as fmtContato, registrar } from "../lib/log";
import { sha256 } from "../lib/util";
import { acordarOrganizador } from "../services/organizador";
import { EnvioInvalido, ingerirEnvio } from "../services/ingestao";

/**
 * Token do chatbot: cabeçalho Authorization: Bearer <token> (o jeito documentado) ou X-Webhook-Token.
 * ?token= na URL ainda é aceito só para não quebrar fluxos antigos.
 */
function extrairToken(headers: Record<string, string | undefined>, query: Record<string, string | undefined>): string | null {
  const auth = headers["authorization"];
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return headers["x-webhook-token"]?.trim() || query["token"]?.trim() || null;
}

async function chatbotDoToken(token: string | null) {
  if (!token) return null;
  const [linha] = await db
    .select({ chatbot: chatbots, empresaNome: empresas.nome })
    .from(chatbots)
    .innerJoin(empresas, eq(empresas.id, chatbots.empresaId))
    .where(and(eq(chatbots.tokenHash, sha256(token)), eq(chatbots.ativo, true), eq(empresas.ativo, true)));
  return linha ?? null;
}

/**
 * Lê o corpo como JSON. Se falhar, tenta de novo trocando quebras de linha/tabulações
 * "cruas" dentro de textos por \n e \t — o erro mais comum quando a plataforma cola um texto
 * (ex.: o histórico) dentro do corpo.
 */
export function lerJsonTolerante(texto: string): { ok: true; valor: unknown; corrigido: boolean } | { ok: false; erro: string } {
  try {
    return { ok: true, valor: JSON.parse(texto), corrigido: false };
  } catch (e) {
    let saida = "";
    let dentro = false;
    let escapando = false;
    for (const c of texto) {
      if (dentro) {
        if (escapando) escapando = false;
        else if (c === "\\") escapando = true;
        else if (c === '"') dentro = false;
        else if (c < " ") {
          saida += c === "\n" ? "\\n" : c === "\r" ? "\\r" : c === "\t" ? "\\t" : "";
          continue;
        }
      } else if (c === '"') dentro = true;
      saida += c;
    }
    try {
      return { ok: true, valor: JSON.parse(saida), corrigido: true };
    } catch {
      return { ok: false, erro: (e as Error).message };
    }
  }
}

const recorte = (bruto: string) => ({ corpo_bruto: bruto.length <= 20_000 ? bruto : bruto.slice(0, 20_000) + "…" });

/** Guarda uma chamada que não virou atendimento (para não sumir sem rastro) */
async function guardarRecusa(dono: { empresaId: string; chatbotId: string } | null, erro: string, payload: unknown, bruto: string) {
  await db.insert(webhookEventos).values({
    empresaId: dono?.empresaId ?? null,
    chatbotId: dono?.chatbotId ?? null,
    status: "rejeitado",
    erro,
    tamanhoBytes: Buffer.byteLength(bruto),
    payload: payload && typeof payload === "object" ? payload : recorte(bruto),
  });
}

async function receber({ request, headers, query, set }: { request: Request; headers: Record<string, string | undefined>; query: Record<string, string | undefined>; set: { status?: number | string } }) {
  // Lê o corpo na mão: nenhuma chamada some sem registro, mesmo com JSON quebrado ou token errado
  const bruto = await request.text();
  const lido = lerJsonTolerante(bruto);
  const body = lido.ok ? lido.valor : null;
  const p = (body && typeof body === "object" ? body : {}) as Record<string, any>;
  const conta = p.account_id ?? p.page_id ? `conta ${p.account_id ?? p.page_id}` : null;

  const token = extrairToken(headers, query);
  const achado = await chatbotDoToken(token);
  if (!achado) {
    const motivo = token ? `token inválido (começa com ${token.slice(0, 8)}…)` : "chegou sem token";
    registrar("WEBHOOK", `RECUSADO: ${motivo}`, conta, p.full_name, fmtContato(p.phone), `${bruto.length} bytes`);
    await guardarRecusa(null, `Recusado: ${motivo}`, body, bruto);
    set.status = 401;
    return { ok: false, erro: token ? "Token inválido" : "Envie o token no cabeçalho Authorization: Bearer <token do chatbot>" };
  }
  const { chatbot, empresaNome } = achado;
  const dono = { empresaId: chatbot.empresaId, chatbotId: chatbot.id };
  const quem = `${empresaNome} / ${chatbot.nome}`;
  if (!lido.ok) {
    registrar("WEBHOOK", "RECUSADO: JSON inválido", quem, `${bruto.length} bytes`, `erro: ${lido.erro}`);
    await guardarRecusa(dono, `JSON inválido no corpo: ${lido.erro}`, null, bruto);
    set.status = 400;
    return { ok: false, erro: `JSON inválido no corpo da requisição: ${lido.erro}` };
  }

  try {
    const r = await ingerirEnvio(chatbot, body, Buffer.byteLength(bruto));
    registrar(
      "WEBHOOK",
      "Envio recebido",
      quem,
      conta,
      r.contato,
      fmtContato(r.telefone),
      r.atendente && `atendente: ${r.atendente}`,
      `${r.sessoes} atendimento(s) no histórico: ${r.atendimentosNovos} novo(s), ${r.atendimentosAtualizados} atualizado(s), ${r.mensagensNovas} mensagem(ns) nova(s)`,
      r.origemRegra?.replace(/^Regra: /, "origem pela regra: "),
      lido.corrigido && "JSON corrigido (quebras de linha cruas)",
      r.avisos.length > 0 && `AVISOS: ${r.avisos.join(" | ")}`,
    );
    acordarOrganizador();
    set.status = 202;
    return {
      ok: true,
      evento_id: r.eventoId,
      contato: r.contato,
      atendimentos_no_historico: r.sessoes,
      atendimentos_novos: r.atendimentosNovos,
      atendimentos_atualizados: r.atendimentosAtualizados,
      avisos: r.avisos,
      mensagens_novas: r.mensagensNovas,
    };
  } catch (e) {
    const erro = e instanceof EnvioInvalido ? e.message : "Erro interno ao processar o envio";
    if (!(e instanceof EnvioInvalido)) console.error("Falha ao processar envio:", e);
    registrar("WEBHOOK", "RECUSADO", quem, conta, p.full_name, `erro: ${e instanceof Error ? e.message : String(e)}`);
    await guardarRecusa(dono, e instanceof Error ? e.message.slice(0, 500) : String(e), body, bruto);
    set.status = e instanceof EnvioInvalido ? 422 : 500;
    return { ok: false, erro };
  }
}

const HEADERS_SECRETOS = new Set(["authorization", "x-webhook-token", "cookie"]);

export const rotasWebhook = new Elysia({ prefix: "/api/webhook" })
  // O corpo é lido pela rota (parse: "none") para registrar até JSON quebrado
  .post("/", receber, { parse: "none" })
  .post("/atribuicao", receber, { parse: "none" })
  /**
   * Captura de teste: aceita qualquer formato e só guarda o que chegou, sem criar atendimento.
   * Aparece em "Eventos recebidos" como "capturado".
   */
  .post(
    "/teste",
    async ({ request, headers, query, set }) => {
      const achado = await chatbotDoToken(extrairToken(headers, query));
      if (!achado) {
        set.status = 401;
        return { ok: false, erro: "Token ausente ou inválido. Envie o cabeçalho Authorization: Bearer <token do chatbot>." };
      }
      const bruto = await request.text();
      const lido = lerJsonTolerante(bruto);
      const cabecalhos = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, HEADERS_SECRETOS.has(k) ? "(oculto)" : v]));
      await db.insert(webhookEventos).values({
        empresaId: achado.chatbot.empresaId,
        chatbotId: achado.chatbot.id,
        status: "capturado",
        tamanhoBytes: Buffer.byteLength(bruto),
        payload: { corpo: lido.ok ? lido.valor : null, ...(!lido.ok && recorte(bruto)), cabecalhos, tipo_conteudo: headers["content-type"] ?? null },
      });
      return { ok: true, mensagem: "Recebido e guardado para teste. Veja em Eventos recebidos.", chatbot: achado.chatbot.nome };
    },
    { parse: "none" },
  );
