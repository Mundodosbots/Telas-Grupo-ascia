import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db/client";
import { empresas } from "../db/schema";
import { sha256 } from "../lib/util";
import { acordarAgente } from "../services/classificador";
import { ingerirAtribuicao } from "../services/ingestao";

function extrairToken(headers: Record<string, string | undefined>): string | null {
  const auth = headers["authorization"];
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return headers["x-webhook-token"]?.trim() || null;
}

export const rotasWebhook = new Elysia({ prefix: "/api/webhook" }).post(
  "/atribuicao",
  async ({ headers, body, set }) => {
    const token = extrairToken(headers);
    if (!token) {
      set.status = 401;
      return { ok: false, erro: "Envie o token no header Authorization: Bearer <token>" };
    }
    const [empresa] = await db
      .select()
      .from(empresas)
      .where(and(eq(empresas.tokenHash, sha256(token)), eq(empresas.ativo, true)));
    if (!empresa) {
      set.status = 401;
      return { ok: false, erro: "Token inválido" };
    }

    const r = await ingerirAtribuicao(empresa, body);

    if (r.status === "rejeitado") {
      set.status = 422;
      return { ok: false, erro: r.erro, evento_id: r.eventoId };
    }
    if (r.status === "duplicado") {
      return { ok: true, duplicado: true, evento_id: r.eventoId, atendimento_id: r.atendimentoId };
    }
    acordarAgente();
    set.status = 202;
    return {
      ok: true,
      evento_id: r.eventoId,
      atendimento_id: r.atendimentoId,
      novo_atendimento: r.novoAtendimento,
      empresa: empresa.nome,
    };
  },
);
