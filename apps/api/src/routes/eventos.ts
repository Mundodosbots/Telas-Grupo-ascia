import { and, desc, eq, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db/client";
import { empresas, webhookEventos } from "../db/schema";
import { protegido } from "../lib/auth";
import { ehUuid } from "../lib/util";

const STATUS = new Set(["processado", "rejeitado", "duplicado"]);

/** Registro bruto de tudo que chegou pelo webhook — útil para depurar a integração com o bot */
export const rotasEventos = new Elysia({ prefix: "/api/eventos" })
  .use(protegido())
  .get("/", async ({ query }) => {
    const porPagina = Math.min(100, Math.max(1, Number(query.por_pagina) || 30));
    const pagina = Math.max(1, Number(query.pagina) || 1);
    const onde = and(
      ehUuid(query.empresa_id) ? eq(webhookEventos.empresaId, query.empresa_id) : undefined,
      query.status && STATUS.has(query.status)
        ? eq(webhookEventos.status, query.status as "processado" | "rejeitado" | "duplicado")
        : undefined,
    );
    const [{ total }] = (await db
      .select({ total: sql<number>`count(*)::int` })
      .from(webhookEventos)
      .where(onde)) as [{ total: number }];
    const itens = await db
      .select({
        id: webhookEventos.id,
        empresaNome: empresas.nome,
        empresaCor: empresas.cor,
        idExterno: webhookEventos.idExterno,
        status: webhookEventos.status,
        erro: webhookEventos.erro,
        atendimentoId: webhookEventos.atendimentoId,
        recebidoEm: webhookEventos.recebidoEm,
        payload: webhookEventos.payload,
      })
      .from(webhookEventos)
      .leftJoin(empresas, eq(empresas.id, webhookEventos.empresaId))
      .where(onde)
      .orderBy(desc(webhookEventos.recebidoEm))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina);
    return { total, pagina, porPagina, itens };
  });
