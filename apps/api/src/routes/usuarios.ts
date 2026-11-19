import { and, asc, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { usuarios } from "../db/schema";
import { protegido } from "../lib/auth";

const campos = {
  id: usuarios.id,
  nome: usuarios.nome,
  email: usuarios.email,
  papel: usuarios.papel,
  empresaId: usuarios.empresaId,
  ativo: usuarios.ativo,
  ultimoLoginEm: usuarios.ultimoLoginEm,
  criadoEm: usuarios.criadoEm,
};

/**
 * Usuários da empresa (administradores e gerentes).
 * Superadmin: com ?superadmins=1 lista/cria os superadmins da plataforma.
 */
export const rotasUsuarios = new Elysia({ prefix: "/api/usuarios" })
  .use(protegido({ papel: "admin" }))
  .get("/", ({ query, usuario, empresaId, set }) => {
    if (query.superadmins === "1") {
      if (usuario.papel !== "superadmin") {
        set.status = 403;
        return { erro: "Apenas o superadmin" };
      }
      return db.select(campos).from(usuarios).where(isNull(usuarios.empresaId)).orderBy(asc(usuarios.nome));
    }
    if (!empresaId) {
      set.status = 400;
      return { erro: "Escolha uma empresa", codigo: "SEM_EMPRESA" };
    }
    return db.select(campos).from(usuarios).where(eq(usuarios.empresaId, empresaId)).orderBy(asc(usuarios.nome));
  })
  .post(
    "/",
    async ({ body, usuario, empresaId, set }) => {
      const superadmin = body.papel === "superadmin";
      if (superadmin && usuario.papel !== "superadmin") {
        set.status = 403;
        return { erro: "Apenas o superadmin cria superadmins" };
      }
      if (!superadmin && !empresaId) {
        set.status = 400;
        return { erro: "Escolha uma empresa", codigo: "SEM_EMPRESA" };
      }
      const email = body.email.toLowerCase().trim();
      const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
      if (existe) {
        set.status = 409;
        return { erro: "Já existe um usuário com esse e-mail" };
      }
      const [u] = await db
        .insert(usuarios)
        .values({
          nome: body.nome.trim(),
          email,
          senhaHash: await Bun.password.hash(body.senha),
          papel: body.papel,
          empresaId: superadmin ? null : empresaId,
        })
        .returning(campos);
      set.status = 201;
      return u;
    },
    {
      body: t.Object({
        nome: t.String({ minLength: 1 }),
        email: t.String({ format: "email" }),
        senha: t.String({ minLength: 8 }),
        papel: t.Union([t.Literal("admin"), t.Literal("gerente"), t.Literal("superadmin")]),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, usuario, empresaId, set }) => {
      const [alvo] = await db.select().from(usuarios).where(eq(usuarios.id, params.id));
      // Admin só mexe em usuários da própria empresa; superadmin mexe em todos
      const pode = alvo && (usuario.papel === "superadmin" || (alvo.empresaId && alvo.empresaId === empresaId));
      if (!pode) {
        set.status = 404;
        return { erro: "Usuário não encontrado" };
      }
      if (alvo.id === usuario.id && (body.ativo === false || (body.papel && body.papel !== alvo.papel))) {
        set.status = 400;
        return { erro: "Você não pode desativar nem mudar o próprio papel" };
      }
      if (alvo.papel === "superadmin" && body.papel) {
        set.status = 400;
        return { erro: "Superadmin não vira usuário de empresa" };
      }
      const dados: Partial<typeof usuarios.$inferInsert> = {};
      if (body.nome !== undefined) dados.nome = body.nome.trim();
      if (body.ativo !== undefined) dados.ativo = body.ativo;
      if (body.papel !== undefined && alvo.papel !== "superadmin") dados.papel = body.papel;
      if (body.senha) dados.senhaHash = await Bun.password.hash(body.senha);
      const [u] = await db.update(usuarios).set(dados).where(and(eq(usuarios.id, params.id))).returning(campos);
      return u;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        nome: t.Optional(t.String({ minLength: 1 })),
        papel: t.Optional(t.Union([t.Literal("admin"), t.Literal("gerente")])),
        ativo: t.Optional(t.Boolean()),
        senha: t.Optional(t.String({ minLength: 8 })),
      }),
    },
  );
