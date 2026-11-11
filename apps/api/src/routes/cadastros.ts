import { and, asc, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { atendimentoEtiquetas, atendimentos, etiquetas, origens } from "../db/schema";
import { protegido } from "../lib/auth";

const corpoCriar = t.Object({
  nome: t.String({ minLength: 1, maxLength: 80 }),
  descricao: t.Optional(t.String({ maxLength: 600 })),
  cor: t.Optional(t.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
  empresa_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
});
const corpoEditar = t.Object({
  nome: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
  descricao: t.Optional(t.String({ maxLength: 600 })),
  cor: t.Optional(t.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
  empresa_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
  ativo: t.Optional(t.Boolean()),
});
const paramsId = t.Object({ id: t.String({ format: "uuid" }) });

type CorpoEditar = typeof corpoEditar.static;
function paraBanco(b: CorpoEditar) {
  return {
    ...(b.nome !== undefined && { nome: b.nome.trim() }),
    ...(b.descricao !== undefined && { descricao: b.descricao.trim() }),
    ...(b.cor !== undefined && { cor: b.cor }),
    ...(b.empresa_id !== undefined && { empresaId: b.empresa_id }),
    ...(b.ativo !== undefined && { ativo: b.ativo }),
  };
}

/** Origens: de onde o cliente veio. A descrição orienta o agente. */
export const rotasOrigens = new Elysia({ prefix: "/api/origens" })
  .use(protegido())
  .get("/", () =>
    db
      .select({
        id: origens.id,
        nome: origens.nome,
        descricao: origens.descricao,
        cor: origens.cor,
        empresaId: origens.empresaId,
        ativo: origens.ativo,
        uso: sql<number>`(select count(*)::int from atendimentos a where a.origem_id = ${origens.id})`,
      })
      .from(origens)
      .orderBy(asc(origens.nome)),
  )
  .post(
    "/",
    async ({ body, set }) => {
      const [o] = await db
        .insert(origens)
        .values({ nome: body.nome.trim(), descricao: body.descricao?.trim() ?? "", cor: body.cor, empresaId: body.empresa_id ?? null })
        .returning();
      set.status = 201;
      return o;
    },
    { body: corpoCriar },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const [o] = await db.update(origens).set(paraBanco(body)).where(eq(origens.id, params.id)).returning();
      if (!o) {
        set.status = 404;
        return { erro: "Origem não encontrada" };
      }
      return o;
    },
    { params: paramsId, body: corpoEditar },
  )
  .delete(
    "/:id",
    async ({ params, set }) => {
      const [{ n }] = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(atendimentos)
        .where(eq(atendimentos.origemId, params.id))) as [{ n: number }];
      if (n > 0) {
        set.status = 409;
        return { erro: `Origem usada em ${n} atendimento(s). Desative em vez de excluir.` };
      }
      await db.delete(origens).where(eq(origens.id, params.id));
      return { ok: true };
    },
    { params: paramsId },
  );

/** Etiquetas: marcações livres (interesse, perfil, situação). */
export const rotasEtiquetas = new Elysia({ prefix: "/api/etiquetas" })
  .use(protegido())
  .get("/", () =>
    db
      .select({
        id: etiquetas.id,
        nome: etiquetas.nome,
        descricao: etiquetas.descricao,
        cor: etiquetas.cor,
        empresaId: etiquetas.empresaId,
        ativo: etiquetas.ativo,
        uso: sql<number>`(select count(*)::int from atendimento_etiquetas ae where ae.etiqueta_id = ${etiquetas.id})`,
      })
      .from(etiquetas)
      .orderBy(asc(etiquetas.nome)),
  )
  .post(
    "/",
    async ({ body, set }) => {
      const [e] = await db
        .insert(etiquetas)
        .values({ nome: body.nome.trim(), descricao: body.descricao?.trim() ?? "", cor: body.cor, empresaId: body.empresa_id ?? null })
        .returning();
      set.status = 201;
      return e;
    },
    { body: corpoCriar },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const [e] = await db.update(etiquetas).set(paraBanco(body)).where(eq(etiquetas.id, params.id)).returning();
      if (!e) {
        set.status = 404;
        return { erro: "Etiqueta não encontrada" };
      }
      return e;
    },
    { params: paramsId, body: corpoEditar },
  )
  .delete(
    "/:id",
    async ({ params }) => {
      await db.delete(atendimentoEtiquetas).where(and(eq(atendimentoEtiquetas.etiquetaId, params.id)));
      await db.delete(etiquetas).where(eq(etiquetas.id, params.id));
      return { ok: true };
    },
    { params: paramsId },
  );
