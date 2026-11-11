import { asc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { usuarios } from "../db/schema";
import { protegido } from "../lib/auth";

const campos = {
  id: usuarios.id,
  nome: usuarios.nome,
  email: usuarios.email,
  papel: usuarios.papel,
  ativo: usuarios.ativo,
  ultimoLoginEm: usuarios.ultimoLoginEm,
  criadoEm: usuarios.criadoEm,
};

/** Só o master gerencia contas */
export const rotasUsuarios = new Elysia({ prefix: "/api/usuarios" })
  .use(protegido("master"))
  .get("/", () => db.select(campos).from(usuarios).orderBy(asc(usuarios.nome)))
  .post(
    "/",
    async ({ body, set }) => {
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
          papel: body.papel ?? "gerente",
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
        papel: t.Optional(t.Union([t.Literal("master"), t.Literal("gerente")])),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, usuario, set }) => {
      if (params.id === usuario.id && (body.ativo === false || body.papel === "gerente")) {
        set.status = 400;
        return { erro: "Você não pode desativar nem rebaixar a própria conta" };
      }
      const dados: Partial<typeof usuarios.$inferInsert> = {};
      if (body.nome !== undefined) dados.nome = body.nome.trim();
      if (body.ativo !== undefined) dados.ativo = body.ativo;
      if (body.papel !== undefined) dados.papel = body.papel;
      if (body.senha) dados.senhaHash = await Bun.password.hash(body.senha);
      const [u] = await db.update(usuarios).set(dados).where(eq(usuarios.id, params.id)).returning(campos);
      if (!u) {
        set.status = 404;
        return { erro: "Usuário não encontrado" };
      }
      return u;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        nome: t.Optional(t.String({ minLength: 1 })),
        ativo: t.Optional(t.Boolean()),
        papel: t.Optional(t.Union([t.Literal("master"), t.Literal("gerente")])),
        senha: t.Optional(t.String({ minLength: 8 })),
      }),
    },
  );
