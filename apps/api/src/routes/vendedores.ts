import { and, asc, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { atendimentos, atribuicoes, empresas, vendedores } from "../db/schema";
import { protegido } from "../lib/auth";
import { ehUuid, normalizarNome } from "../lib/util";

const paramsId = t.Object({ id: t.String({ format: "uuid" }) });

export const rotasVendedores = new Elysia({ prefix: "/api/vendedores" })
  .use(protegido())
  .get("/", ({ query }) =>
    db
      .select({
        id: vendedores.id,
        nome: vendedores.nome,
        email: vendedores.email,
        idExterno: vendedores.idExterno,
        apelidos: vendedores.apelidos,
        ativo: vendedores.ativo,
        empresaId: vendedores.empresaId,
        empresaNome: empresas.nome,
        empresaCor: empresas.cor,
        atendimentos: sql<number>`(select count(*)::int from atendimentos a where a.vendedor_atual_id = ${vendedores.id})`,
        ultimaAtribuicao: sql<string | null>`(select max(at.atribuido_em) from atribuicoes at where at.vendedor_id = ${vendedores.id})`,
      })
      .from(vendedores)
      .innerJoin(empresas, eq(empresas.id, vendedores.empresaId))
      .where(ehUuid(query.empresa_id) ? eq(vendedores.empresaId, query.empresa_id) : undefined)
      .orderBy(asc(empresas.nome), asc(vendedores.nome)),
  )
  .post(
    "/",
    async ({ body, set }) => {
      const nomeNormalizado = normalizarNome(body.nome);
      const [existe] = await db
        .select({ id: vendedores.id })
        .from(vendedores)
        .where(and(eq(vendedores.empresaId, body.empresa_id), eq(vendedores.nomeNormalizado, nomeNormalizado)));
      if (existe) {
        set.status = 409;
        return { erro: "Já existe um vendedor com esse nome nesta empresa" };
      }
      const [v] = await db
        .insert(vendedores)
        .values({
          empresaId: body.empresa_id,
          nome: body.nome.trim(),
          nomeNormalizado,
          email: body.email || null,
          idExterno: body.id_externo || null,
        })
        .returning();
      set.status = 201;
      return v;
    },
    {
      body: t.Object({
        empresa_id: t.String({ format: "uuid" }),
        nome: t.String({ minLength: 1 }),
        email: t.Optional(t.String()),
        id_externo: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const dados: Partial<typeof vendedores.$inferInsert> = {};
      if (body.nome !== undefined) {
        dados.nome = body.nome.trim();
        dados.nomeNormalizado = normalizarNome(body.nome);
      }
      if (body.email !== undefined) dados.email = body.email || null;
      if (body.id_externo !== undefined) dados.idExterno = body.id_externo || null;
      if (body.ativo !== undefined) dados.ativo = body.ativo;
      try {
        const [v] = await db.update(vendedores).set(dados).where(eq(vendedores.id, params.id)).returning();
        if (!v) {
          set.status = 404;
          return { erro: "Vendedor não encontrado" };
        }
        return v;
      } catch {
        set.status = 409;
        return { erro: "Já existe um vendedor com esse nome (ou ID externo) nesta empresa. Use 'mesclar'." };
      }
    },
    {
      params: paramsId,
      body: t.Object({
        nome: t.Optional(t.String({ minLength: 1 })),
        email: t.Optional(t.String()),
        id_externo: t.Optional(t.String()),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  /**
   * Mescla um vendedor duplicado (ex.: "Carlos" e "Carlos Souza") no vendedor destino.
   * Atendimentos e histórico passam para o destino e o duplicado é apagado.
   */
  .post(
    "/:id/mesclar",
    async ({ params, body, set }) => {
      if (params.id === body.destino_id) {
        set.status = 400;
        return { erro: "Escolha um vendedor diferente" };
      }
      const [origem] = await db.select().from(vendedores).where(eq(vendedores.id, params.id));
      const [destino] = await db.select().from(vendedores).where(eq(vendedores.id, body.destino_id));
      if (!origem || !destino) {
        set.status = 404;
        return { erro: "Vendedor não encontrado" };
      }
      if (origem.empresaId !== destino.empresaId) {
        set.status = 400;
        return { erro: "Só é possível mesclar vendedores da mesma empresa" };
      }
      await db.transaction(async (tx) => {
        await tx.update(atendimentos).set({ vendedorAtualId: destino.id }).where(eq(atendimentos.vendedorAtualId, origem.id));
        await tx.update(atribuicoes).set({ vendedorId: destino.id }).where(eq(atribuicoes.vendedorId, origem.id));
        await tx.delete(vendedores).where(eq(vendedores.id, origem.id));
        const apelidos = [...new Set([...destino.apelidos, ...origem.apelidos, origem.nomeNormalizado])].filter(
          (a) => a !== destino.nomeNormalizado,
        );
        await tx
          .update(vendedores)
          .set({ apelidos, ...(origem.idExterno && !destino.idExterno && { idExterno: origem.idExterno }) })
          .where(eq(vendedores.id, destino.id));
      });
      return { ok: true };
    },
    { params: paramsId, body: t.Object({ destino_id: t.String({ format: "uuid" }) }) },
  );
