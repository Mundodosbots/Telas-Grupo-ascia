import { and, asc, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { chatbots } from "../db/schema";
import { env } from "../env";
import { protegido } from "../lib/auth";
import { gerarTokenWebhook, sha256 } from "../lib/util";
import { HORARIO_PADRAO } from "../services/historico";

const campos = {
  id: chatbots.id,
  nome: chatbots.nome,
  cor: chatbots.cor,
  tokenPrefixo: chatbots.tokenPrefixo,
  tokenGeradoEm: chatbots.tokenGeradoEm,
  contaExterna: chatbots.contaExterna,
  fuso: chatbots.fuso,
  horario: chatbots.horario,
  ativo: chatbots.ativo,
  criadoEm: chatbots.criadoEm,
};
const horarioSchema = t.Record(t.String({ pattern: "^[0-6]$" }), t.Array(t.Tuple([t.String({ pattern: "^\\d{2}:\\d{2}$" }), t.String({ pattern: "^\\d{2}:\\d{2}$" })])));
const fusoValido = (f: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: f });
    return true;
  } catch {
    return false;
  }
};

/** Chatbots (contas da plataforma) da empresa — cada um tem seu link de webhook */
export const rotasChatbots = new Elysia({ prefix: "/api/chatbots" })
  .use(protegido({ empresa: true }))
  .get("/", ({ empresaId }) =>
    db
      .select({
        ...campos,
        hoje: sql<number>`(select count(*)::int from webhook_eventos w where w.chatbot_id = "chatbots"."id" and w.status = 'processado'
                            and w.recebido_em >= date_trunc('day', now() at time zone ${env.TZ_RELATORIOS}) at time zone ${env.TZ_RELATORIOS})`,
        recusadosHoje: sql<number>`(select count(*)::int from webhook_eventos w where w.chatbot_id = "chatbots"."id" and w.status = 'rejeitado'
                            and w.recebido_em >= date_trunc('day', now() at time zone ${env.TZ_RELATORIOS}) at time zone ${env.TZ_RELATORIOS})`,
        ultimoEvento: sql<string | null>`(select max(recebido_em) from webhook_eventos w where w.chatbot_id = "chatbots"."id")`,
        atendimentos: sql<number>`(select count(*)::int from atendimentos a where a.chatbot_id = "chatbots"."id")`,
      })
      .from(chatbots)
      .where(eq(chatbots.empresaId, empresaId))
      .orderBy(asc(chatbots.nome)),
  )
  .use(protegido({ papel: "admin", empresa: true }))
  .post(
    "/",
    async ({ body, empresaId, set }) => {
      if (body.fuso && !fusoValido(body.fuso)) {
        set.status = 400;
        return { erro: "Fuso horário inválido" };
      }
      const [c] = await db
        .insert(chatbots)
        .values({ empresaId, nome: body.nome.trim(), cor: body.cor ?? "#2a78d6", fuso: body.fuso ?? "America/Cuiaba", horario: body.horario ?? HORARIO_PADRAO })
        .returning(campos);
      set.status = 201;
      return c;
    },
    { body: t.Object({ nome: t.String({ minLength: 1 }), cor: t.Optional(t.String()), fuso: t.Optional(t.String()), horario: t.Optional(horarioSchema) }) },
  )
  .patch(
    "/:id",
    async ({ params, body, empresaId, set }) => {
      if (body.fuso && !fusoValido(body.fuso)) {
        set.status = 400;
        return { erro: "Fuso horário inválido" };
      }
      const [c] = await db
        .update(chatbots)
        .set({
          ...(body.nome && { nome: body.nome.trim() }),
          ...(body.cor && { cor: body.cor }),
          ...(body.fuso && { fuso: body.fuso }),
          ...(body.horario && { horario: body.horario }),
          ...(body.ativo !== undefined && { ativo: body.ativo }),
        })
        .where(and(eq(chatbots.id, params.id), eq(chatbots.empresaId, empresaId)))
        .returning(campos);
      if (!c) {
        set.status = 404;
        return { erro: "Chatbot não encontrado" };
      }
      return c;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        nome: t.Optional(t.String({ minLength: 1 })),
        cor: t.Optional(t.String()),
        fuso: t.Optional(t.String()),
        horario: t.Optional(horarioSchema),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  /** Gera (ou troca) o token do link. O token só aparece nesta resposta. */
  .post(
    "/:id/token",
    async ({ params, empresaId, set }) => {
      const token = gerarTokenWebhook();
      const [c] = await db
        .update(chatbots)
        .set({ tokenHash: sha256(token), tokenPrefixo: token.slice(0, 10), tokenGeradoEm: new Date() })
        .where(and(eq(chatbots.id, params.id), eq(chatbots.empresaId, empresaId)))
        .returning({ id: chatbots.id });
      if (!c) {
        set.status = 404;
        return { erro: "Chatbot não encontrado" };
      }
      return { token };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
