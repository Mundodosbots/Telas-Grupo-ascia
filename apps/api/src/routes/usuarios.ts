import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { chatbots, usuarios } from "../db/schema";
import { protegido } from "../lib/auth";

const campos = {
  id: usuarios.id,
  nome: usuarios.nome,
  email: usuarios.email,
  papel: usuarios.papel,
  chatbotIds: usuarios.chatbotIds,
  empresaId: usuarios.empresaId,
  ativo: usuarios.ativo,
  ultimoLoginEm: usuarios.ultimoLoginEm,
  criadoEm: usuarios.criadoEm,
};

/**
 * Chatbots que o gerente pode ver: nulo = todos os da empresa. Só aceita chatbots da própria empresa
 * (lista vazia é recusada: um gerente sem nenhum chatbot não veria nada).
 */
async function validarChatbots(empresaId: string, ids: string[] | null | undefined): Promise<string[] | null | { erro: string }> {
  if (ids === null || ids === undefined) return null;
  const unicos = [...new Set(ids)];
  if (!unicos.length) return { erro: "Escolha pelo menos um chatbot, ou marque que o usuário vê todos" };
  const achados = await db
    .select({ id: chatbots.id })
    .from(chatbots)
    .where(and(eq(chatbots.empresaId, empresaId), inArray(chatbots.id, unicos)));
  if (achados.length !== unicos.length) return { erro: "Chatbot não encontrado nesta empresa" };
  return unicos;
}

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
      // Só o gerente pode ter acesso limitado; administrador vê a empresa toda
      const ids = body.papel === "gerente" ? await validarChatbots(empresaId, body.chatbot_ids) : null;
      if (ids && !Array.isArray(ids)) {
        set.status = 400;
        return ids;
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
          chatbotIds: ids,
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
        /** Nulo ou ausente = vê todos os chatbots da empresa */
        chatbot_ids: t.Optional(t.Nullable(t.Array(t.String({ format: "uuid" }), { maxItems: 200 }))),
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
      const papelFinal = dados.papel ?? alvo.papel;
      if (papelFinal !== "gerente") dados.chatbotIds = null;
      else if (body.chatbot_ids !== undefined && alvo.empresaId) {
        const ids = await validarChatbots(alvo.empresaId, body.chatbot_ids);
        if (ids && !Array.isArray(ids)) {
          set.status = 400;
          return ids;
        }
        dados.chatbotIds = ids;
      }
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
        chatbot_ids: t.Optional(t.Nullable(t.Array(t.String({ format: "uuid" }), { maxItems: 200 }))),
      }),
    },
  );
