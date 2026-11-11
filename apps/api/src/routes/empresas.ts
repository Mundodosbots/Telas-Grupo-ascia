import { asc, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { empresas } from "../db/schema";
import { protegido } from "../lib/auth";
import { gerarTokenWebhook, sha256 } from "../lib/util";

const campos = {
  id: empresas.id,
  nome: empresas.nome,
  slug: empresas.slug,
  cor: empresas.cor,
  ativo: empresas.ativo,
  tokenPrefixo: empresas.tokenPrefixo,
  tokenGeradoEm: empresas.tokenGeradoEm,
};

export const rotasEmpresas = new Elysia({ prefix: "/api/empresas" })
  .use(protegido())
  .get("/", () =>
    db
      .select({
        ...campos,
        etiquetasPlataforma: sql<number>`(select count(*)::int from dicionario_etiquetas d where d.empresa_id = ${empresas.id})`,
      })
      .from(empresas)
      .orderBy(asc(empresas.nome)),
  )
  .patch(
    "/:id",
    async ({ params, body, usuario, set }) => {
      if (usuario.papel !== "master") {
        set.status = 403;
        return { erro: "Apenas o usuário master pode alterar empresas" };
      }
      const [e] = await db.update(empresas).set(body).where(eq(empresas.id, params.id)).returning(campos);
      if (!e) {
        set.status = 404;
        return { erro: "Empresa não encontrada" };
      }
      return e;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        nome: t.Optional(t.String({ minLength: 1 })),
        cor: t.Optional(t.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  /** Gera (ou troca) o token do webhook. O token completo só aparece nesta resposta. */
  .post(
    "/:id/token",
    async ({ params, usuario, set }) => {
      if (usuario.papel !== "master") {
        set.status = 403;
        return { erro: "Apenas o usuário master pode gerar tokens" };
      }
      const token = gerarTokenWebhook();
      const [e] = await db
        .update(empresas)
        .set({ tokenHash: sha256(token), tokenPrefixo: token.slice(0, 10), tokenGeradoEm: new Date() })
        .where(eq(empresas.id, params.id))
        .returning(campos);
      if (!e) {
        set.status = 404;
        return { erro: "Empresa não encontrada" };
      }
      return { empresa: e, token };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
