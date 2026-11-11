import { and, asc, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { atendimentos, atribuicoes, empresas, vendedores } from "../db/schema";
import { protegido } from "../lib/auth";
import { ehUuid, normalizarNome } from "../lib/util";

const paramsId = t.Object({ id: t.String({ format: "uuid" }) });

/** "RUDISON  MORETTI " → "RUDISON MORETTI" */
const limparNome = (s: string) => s.replace(/\s+/g, " ").trim();

export const rotasVendedores = new Elysia({ prefix: "/api/vendedores" })
  .use(protegido())
  /**
   * Importa os administradores (atendentes) exportados da plataforma como vendedores da empresa:
   * [{ "id": "1000859765", "full_name": "RUDISON  MORETTI", "email": "..." }, ...]
   * Casa pelo ID da plataforma ou pelo nome; cria quem não existe e completa e-mail/ID de quem já existe.
   */
  .post(
    "/importar",
    async ({ body, set }) => {
      const itens = body.itens
        .map((i) => ({
          idExterno: String(i.id ?? "").trim() || null,
          nome: limparNome(String(i.full_name ?? [i.first_name, i.last_name].filter(Boolean).join(" ") ?? "")),
          email: String(i.email ?? "").trim() || null,
        }))
        .filter((i) => i.nome);
      if (!itens.length) {
        set.status = 400;
        return { erro: "Nenhum administrador válido. O formato esperado é uma lista com id e full_name." };
      }
      let criados = 0;
      let atualizados = 0;
      for (const i of itens) {
        const nomeNormalizado = normalizarNome(i.nome);
        const [porId] = i.idExterno
          ? await db.select().from(vendedores).where(and(eq(vendedores.empresaId, body.empresa_id), eq(vendedores.idExterno, i.idExterno)))
          : [];
        const [existente] = porId
          ? [porId]
          : await db
              .select()
              .from(vendedores)
              .where(
                and(
                  eq(vendedores.empresaId, body.empresa_id),
                  sql`(${vendedores.nomeNormalizado} = ${nomeNormalizado} or ${nomeNormalizado} = any(${vendedores.apelidos}))`,
                ),
              );
        if (existente) {
          await db
            .update(vendedores)
            .set({ idExterno: existente.idExterno ?? i.idExterno, email: existente.email ?? i.email })
            .where(eq(vendedores.id, existente.id));
          atualizados++;
        } else {
          await db.insert(vendedores).values({ empresaId: body.empresa_id, nome: i.nome, nomeNormalizado, idExterno: i.idExterno, email: i.email });
          criados++;
        }
      }
      return { ok: true, criados, atualizados };
    },
    {
      body: t.Object({
        empresa_id: t.String({ format: "uuid" }),
        itens: t.Array(
          t.Object({
            id: t.Optional(t.Union([t.String(), t.Number()])),
            full_name: t.Optional(t.String()),
            first_name: t.Optional(t.String()),
            last_name: t.Optional(t.String()),
            email: t.Optional(t.String()),
          }),
        ),
      }),
    },
  )
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
