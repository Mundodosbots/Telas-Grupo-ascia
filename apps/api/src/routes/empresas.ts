import { and, asc, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { atendentes, atendimentos, chatbots, contatos, empresas, usuarios, webhookEventos } from "../db/schema";
import { registrar } from "../lib/log";
import { semearEmpresa } from "../db/seed";
import { protegido } from "../lib/auth";
import { normalizarNome } from "../lib/util";
import { ingerirEnvio } from "../services/ingestao";
import { acordarOrganizador } from "../services/organizador";

const slugDe = (nome: string) =>
  normalizarNome(nome)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "empresa";

/** Empresas clientes do SaaS — só o superadmin mexe aqui */
export const rotasEmpresas = new Elysia({ prefix: "/api/empresas" })
  .use(protegido({ papel: "superadmin" }))
  .get("/", () =>
    db
      .select({
        id: empresas.id,
        nome: empresas.nome,
        slug: empresas.slug,
        ativo: empresas.ativo,
        criadoEm: empresas.criadoEm,
        chatbots: sql<number>`(select count(*)::int from chatbots c where c.empresa_id = "empresas"."id")`,
        usuarios: sql<number>`(select count(*)::int from usuarios u where u.empresa_id = "empresas"."id")`,
        atendimentos: sql<number>`(select count(*)::int from atendimentos a where a.empresa_id = "empresas"."id")`,
        ultimoEvento: sql<string | null>`(select max(recebido_em) from webhook_eventos w where w.empresa_id = "empresas"."id")`,
      })
      .from(empresas)
      .orderBy(asc(empresas.nome)),
  )
  .post(
    "/",
    async ({ body, set }) => {
      const email = body.admin.email.toLowerCase().trim();
      const [jaExiste] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
      if (jaExiste) {
        set.status = 409;
        return { erro: "Já existe um usuário com esse e-mail" };
      }
      let slug = slugDe(body.nome);
      const [mesmoSlug] = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.slug, slug));
      if (mesmoSlug) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      const [e] = await db.insert(empresas).values({ nome: body.nome.trim(), slug }).returning();
      await semearEmpresa(e!.id);
      await db.insert(usuarios).values({
        empresaId: e!.id,
        nome: body.admin.nome.trim(),
        email,
        senhaHash: await Bun.password.hash(body.admin.senha),
        papel: "admin",
      });
      set.status = 201;
      return e;
    },
    {
      body: t.Object({
        nome: t.String({ minLength: 2 }),
        admin: t.Object({ nome: t.String({ minLength: 1 }), email: t.String({ format: "email" }), senha: t.String({ minLength: 8 }) }),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const [e] = await db
        .update(empresas)
        .set({ ...(body.nome && { nome: body.nome.trim() }), ...(body.ativo !== undefined && { ativo: body.ativo }) })
        .where(eq(empresas.id, params.id))
        .returning();
      if (!e) {
        set.status = 404;
        return { erro: "Empresa não encontrada" };
      }
      return e;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ nome: t.Optional(t.String({ minLength: 2 })), ativo: t.Optional(t.Boolean()) }),
    },
  )
  /**
   * Apaga os dados recebidos da plataforma (contatos, atendimentos, conversas e envios), para recomeçar a contagem.
   * Cadastros ficam: chatbots e tokens, usuários, origens, departamentos, etiquetas, regras e times.
   */
  .post(
    "/:id/limpar",
    async ({ params, body, set, usuario }) => {
      const [e] = await db.select().from(empresas).where(eq(empresas.id, params.id));
      if (!e) {
        set.status = 404;
        return { erro: "Empresa não encontrada" };
      }
      if (normalizarNome(body.confirmacao) !== normalizarNome(e.nome)) {
        set.status = 400;
        return { erro: `Para confirmar, digite o nome da empresa exatamente: ${e.nome}` };
      }
      const r = await db.transaction(async (tx) => {
        const [{ total: atend }] = (await tx.select({ total: sql<number>`count(*)::int` }).from(atendimentos).where(eq(atendimentos.empresaId, e.id))) as [{ total: number }];
        const envios = await tx.delete(webhookEventos).where(eq(webhookEventos.empresaId, e.id)).returning({ id: webhookEventos.id });
        // Apagar o contato leva junto atendimentos, mensagens e ligações (cascata)
        const ctts = await tx.delete(contatos).where(eq(contatos.empresaId, e.id)).returning({ id: contatos.id });
        const atds = body.atendentes ? await tx.delete(atendentes).where(eq(atendentes.empresaId, e.id)).returning({ id: atendentes.id }) : [];
        return { contatos: ctts.length, atendimentos: atend, envios: envios.length, atendentes: atds.length };
      });
      registrar("LIMPEZA", `${e.nome}: dados recebidos apagados por ${usuario.email}`, JSON.stringify(r));
      return { ok: true, ...r };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ confirmacao: t.String(), atendentes: t.Boolean() }),
    },
  )
  /**
   * Refaz todos os envios já recebidos com as regras atuais (como se tivessem chegado agora, na ordem).
   * Apaga contatos e atendimentos e monta de novo a partir dos envios guardados. Correções manuais se perdem.
   */
  .post(
    "/:id/reprocessar",
    async ({ params, body, set, usuario }) => {
      const [e] = await db.select().from(empresas).where(eq(empresas.id, params.id));
      if (!e) {
        set.status = 404;
        return { erro: "Empresa não encontrada" };
      }
      if (normalizarNome(body.confirmacao) !== normalizarNome(e.nome)) {
        set.status = 400;
        return { erro: `Para confirmar, digite o nome da empresa exatamente: ${e.nome}` };
      }
      const envios = await db
        .select({ id: webhookEventos.id, payload: webhookEventos.payload, tamanho: webhookEventos.tamanhoBytes, chatbotId: webhookEventos.chatbotId })
        .from(webhookEventos)
        .where(and(eq(webhookEventos.empresaId, e.id), eq(webhookEventos.status, "processado")))
        .orderBy(asc(webhookEventos.recebidoEm));
      const bots = new Map((await db.select().from(chatbots).where(eq(chatbots.empresaId, e.id))).map((c) => [c.id, c]));
      await db.delete(contatos).where(eq(contatos.empresaId, e.id));
      let ok = 0;
      const falhas: string[] = [];
      for (const ev of envios) {
        const bot = ev.chatbotId ? bots.get(ev.chatbotId) : undefined;
        if (!bot) continue;
        try {
          await ingerirEnvio(bot, ev.payload, ev.tamanho, { eventoId: ev.id });
          ok++;
        } catch (err) {
          falhas.push((err as Error).message);
        }
      }
      const [{ total }] = (await db.select({ total: sql<number>`count(*)::int` }).from(atendimentos).where(eq(atendimentos.empresaId, e.id))) as [{ total: number }];
      registrar("REPROCESSAMENTO", `${e.nome}: ${ok} de ${envios.length} envio(s) refeitos por ${usuario.email}`, falhas.length ? `falhas: ${falhas.slice(0, 3).join(" | ")}` : null);
      acordarOrganizador();
      return { ok: true, envios: envios.length, refeitos: ok, falhas: falhas.length, atendimentos: total };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ confirmacao: t.String() }),
    },
  );
