import { and, desc, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { chatbots, contatos, webhookEventos } from "../db/schema";
import { protegido } from "../lib/auth";
import { ehUuid } from "../lib/util";

const STATUS = new Set(["processado", "rejeitado", "capturado"]);

/** Registro bruto de tudo que chegou pelo webhook — para conferir a integração */
export const rotasEventos = new Elysia({ prefix: "/api/eventos" })
  .use(protegido({ empresa: true }))
  .get("/", async ({ query, empresaId }) => {
    const porPagina = Math.min(100, Math.max(1, Number(query.por_pagina) || 30));
    const pagina = Math.max(1, Number(query.pagina) || 1);
    const onde = and(
      eq(webhookEventos.empresaId, empresaId),
      ehUuid(query.chatbot_id) ? eq(webhookEventos.chatbotId, query.chatbot_id) : undefined,
      query.status && STATUS.has(query.status) ? eq(webhookEventos.status, query.status as "processado" | "rejeitado" | "capturado") : undefined,
    );
    const [{ total }] = (await db.select({ total: sql<number>`count(*)::int` }).from(webhookEventos).where(onde)) as [{ total: number }];
    const itens = await db
      .select({
        id: webhookEventos.id,
        chatbotNome: chatbots.nome,
        chatbotCor: chatbots.cor,
        contatoId: webhookEventos.contatoId,
        contatoNome: contatos.nome,
        status: webhookEventos.status,
        erro: webhookEventos.erro,
        resultado: webhookEventos.resultado,
        tamanhoBytes: webhookEventos.tamanhoBytes,
        recebidoEm: webhookEventos.recebidoEm,
      })
      .from(webhookEventos)
      .leftJoin(chatbots, eq(chatbots.id, webhookEventos.chatbotId))
      .leftJoin(contatos, eq(contatos.id, webhookEventos.contatoId))
      .where(onde)
      .orderBy(desc(webhookEventos.recebidoEm))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina);
    return { total, pagina, porPagina, itens };
  })
  /** JSON completo de um envio (pode ser grande: só carrega quando pedem) */
  .get(
    "/:id",
    async ({ params, empresaId, set }) => {
      const [e] = await db
        .select({ payload: webhookEventos.payload })
        .from(webhookEventos)
        .where(and(eq(webhookEventos.id, params.id), eq(webhookEventos.empresaId, empresaId)));
      if (!e) {
        set.status = 404;
        return { erro: "Evento não encontrado" };
      }
      return e.payload;
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
