import { and, asc, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { departamentos, etiquetas, origens, times } from "../db/schema";
import { protegido } from "../lib/auth";
import { chatbotsPermitidos } from "../lib/filtros";

const paramsId = t.Object({ id: t.String({ format: "uuid" }) });
const corpo = {
  nome: t.String({ minLength: 1, maxLength: 80 }),
  descricao: t.Optional(t.String({ maxLength: 600 })),
  cor: t.Optional(t.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
  ativo: t.Optional(t.Boolean()),
};

/** Origens, departamentos e etiquetas: cada empresa tem os seus; o agente escolhe entre os ativos */
function rotasCadastro(prefixo: string, tabela: typeof origens | typeof departamentos | typeof etiquetas, uso: (id: unknown, doChatbot: ReturnType<typeof sql>) => ReturnType<typeof sql>) {
  return new Elysia({ prefix: `/api/${prefixo}` })
    .use(protegido({ empresa: true }))
    .get("/", ({ empresaId, acesso }) =>
      db
        .select({
          id: tabela.id,
          nome: tabela.nome,
          descricao: tabela.descricao,
          cor: tabela.cor,
          ativo: tabela.ativo,
          // coluna qualificada: sem o nome da tabela, o "id" da subconsulta apontaria para a tabela errada
          uso: uso(sql.raw(`"${prefixo}"."id"`), chatbotsPermitidos(sql.raw("a.chatbot_id"), acesso.chatbotIds)) as unknown as ReturnType<typeof sql<number>>,
        })
        .from(tabela)
        .where(eq(tabela.empresaId, empresaId))
        .orderBy(asc(tabela.nome)),
    )
    .use(protegido({ papel: "admin", empresa: true }))
    .post(
      "/",
      async ({ body, empresaId, set }) => {
        const [novo] = await db
          .insert(tabela)
          .values({ empresaId, nome: body.nome.trim(), descricao: body.descricao?.trim() ?? "", cor: body.cor ?? "#898781" })
          .returning();
        set.status = 201;
        return novo;
      },
      { body: t.Object(corpo) },
    )
    .patch(
      "/:id",
      async ({ params, body, empresaId, set }) => {
        const [item] = await db
          .update(tabela)
          .set({
            ...(body.nome !== undefined && { nome: body.nome.trim() }),
            ...(body.descricao !== undefined && { descricao: body.descricao.trim() }),
            ...(body.cor !== undefined && { cor: body.cor }),
            ...(body.ativo !== undefined && { ativo: body.ativo }),
          })
          .where(and(eq(tabela.id, params.id), eq(tabela.empresaId, empresaId)))
          .returning();
        if (!item) {
          set.status = 404;
          return { erro: "Não encontrado" };
        }
        return item;
      },
      { params: paramsId, body: t.Partial(t.Object(corpo)) },
    );
}

export const rotasOrigens = rotasCadastro("origens", origens, (id, doChatbot) => sql<number>`(select count(*)::int from atendimentos a where a.origem_id = ${id} and ${doChatbot})`);
export const rotasDepartamentos = rotasCadastro(
  "departamentos",
  departamentos,
  (id, doChatbot) => sql<number>`(select count(*)::int from atendimentos a where a.departamento_id = ${id} and ${doChatbot})`,
);
export const rotasEtiquetas = rotasCadastro(
  "etiquetas",
  etiquetas,
  (id, doChatbot) =>
    sql<number>`(select count(*)::int from atendimento_etiquetas ae join atendimentos a on a.id = ae.atendimento_id where ae.etiqueta_id = ${id} and ${doChatbot})`,
);

/** Times de atendentes (ex.: Vendas Sinop, Seminovos, CRM) */
export const rotasTimes = new Elysia({ prefix: "/api/times" })
  .use(protegido({ empresa: true }))
  .get("/", ({ empresaId }) =>
    db
      .select({
        id: times.id,
        nome: times.nome,
        cor: times.cor,
        atendentes: sql<number>`(select count(*)::int from atendentes x where x.time_id = "times"."id")`,
      })
      .from(times)
      .where(eq(times.empresaId, empresaId))
      .orderBy(asc(times.nome)),
  )
  .use(protegido({ papel: "admin", empresa: true }))
  .post(
    "/",
    async ({ body, empresaId, set }) => {
      try {
        const [novo] = await db.insert(times).values({ empresaId, nome: body.nome.trim(), cor: body.cor ?? "#6250d6" }).returning();
        set.status = 201;
        return novo;
      } catch {
        set.status = 409;
        return { erro: "Já existe um time com esse nome" };
      }
    },
    { body: t.Object({ nome: t.String({ minLength: 1 }), cor: t.Optional(t.String()) }) },
  )
  .patch(
    "/:id",
    async ({ params, body, empresaId, set }) => {
      const [item] = await db
        .update(times)
        .set({ ...(body.nome && { nome: body.nome.trim() }), ...(body.cor && { cor: body.cor }) })
        .where(and(eq(times.id, params.id), eq(times.empresaId, empresaId)))
        .returning();
      if (!item) {
        set.status = 404;
        return { erro: "Não encontrado" };
      }
      return item;
    },
    { params: paramsId, body: t.Object({ nome: t.Optional(t.String({ minLength: 1 })), cor: t.Optional(t.String()) }) },
  )
  .delete(
    "/:id",
    async ({ params, empresaId }) => {
      await db.delete(times).where(and(eq(times.id, params.id), eq(times.empresaId, empresaId)));
      return { ok: true };
    },
    { params: paramsId },
  );
