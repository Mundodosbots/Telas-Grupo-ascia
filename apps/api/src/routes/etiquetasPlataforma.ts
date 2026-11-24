import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { chatbots, etiquetasPlataforma } from "../db/schema";
import { protegido } from "../lib/auth";

export type EtiquetaPlataforma = { id: string; idExterno: string; nome: string; cor: string; destaque: boolean };

/** Etiquetas da plataforma de cada atendimento, com o nome dado no painel (sem nome: "#583303") */
export async function etiquetasPlataformaDe(itens: { id: string; chatbotId: string; etiquetasPlataforma: string[] }[]) {
  const mapa = new Map<string, EtiquetaPlataforma[]>();
  const ids = [...new Set(itens.flatMap((i) => i.etiquetasPlataforma))];
  if (!ids.length) return mapa;
  const chatbotIds = [...new Set(itens.map((i) => i.chatbotId))];
  const linhas = await db
    .select({
      id: etiquetasPlataforma.id,
      chatbotId: etiquetasPlataforma.chatbotId,
      idExterno: etiquetasPlataforma.idExterno,
      nome: etiquetasPlataforma.nome,
      cor: etiquetasPlataforma.cor,
      destaque: etiquetasPlataforma.destaque,
    })
    .from(etiquetasPlataforma)
    .where(and(inArray(etiquetasPlataforma.chatbotId, chatbotIds), inArray(etiquetasPlataforma.idExterno, ids)));
  const porChave = new Map(linhas.map((l) => [`${l.chatbotId}:${l.idExterno}`, l]));
  for (const i of itens) {
    const lista = i.etiquetasPlataforma.map((x) => {
      const l = porChave.get(`${i.chatbotId}:${x}`);
      return { id: l?.id ?? "", idExterno: x, nome: l?.nome.trim() || `#${x}`, cor: l?.cor ?? "#898781", destaque: !!l?.destaque };
    });
    // Destaques primeiro, depois as que têm nome, depois os números soltos
    lista.sort((a, b) => Number(b.destaque) - Number(a.destaque) || Number(a.nome.startsWith("#")) - Number(b.nome.startsWith("#")) || a.nome.localeCompare(b.nome));
    mapa.set(i.id, lista);
  }
  return mapa;
}

const paramsId = t.Object({ id: t.String({ format: "uuid" }) });

/**
 * A plataforma manda só o número de cada etiqueta do contato. Aqui a empresa dá nome a cada número
 * e escolhe quais ficam em destaque (ex.: Grow) na lista de atendimentos.
 */
export const rotasEtiquetasPlataforma = new Elysia({ prefix: "/api/etiquetas-plataforma" })
  .use(protegido({ empresa: true }))
  .get("/", async ({ empresaId }) => {
    const itens = await db
      .select({
        id: etiquetasPlataforma.id,
        chatbotId: etiquetasPlataforma.chatbotId,
        chatbotNome: chatbots.nome,
        chatbotCor: chatbots.cor,
        idExterno: etiquetasPlataforma.idExterno,
        nome: etiquetasPlataforma.nome,
        cor: etiquetasPlataforma.cor,
        destaque: etiquetasPlataforma.destaque,
        atendimentos: sql<number>`(select count(*)::int from atendimentos a
          where a.chatbot_id = "etiquetas_plataforma"."chatbot_id" and "etiquetas_plataforma"."id_externo" = any(a.etiquetas_plataforma))`,
        contatos: sql<number>`(select count(distinct a.contato_id)::int from atendimentos a
          where a.chatbot_id = "etiquetas_plataforma"."chatbot_id" and "etiquetas_plataforma"."id_externo" = any(a.etiquetas_plataforma))`,
        // Alguns contatos com a etiqueta, para achar na plataforma qual etiqueta é esse número
        exemplos: sql<string[]>`array(select ct.nome from atendimentos a join contatos ct on ct.id = a.contato_id
          where a.chatbot_id = "etiquetas_plataforma"."chatbot_id" and "etiquetas_plataforma"."id_externo" = any(a.etiquetas_plataforma)
          group by ct.id, ct.nome order by max(a.inicio_em) desc limit 3)`,
      })
      .from(etiquetasPlataforma)
      .innerJoin(chatbots, eq(chatbots.id, etiquetasPlataforma.chatbotId))
      .where(eq(etiquetasPlataforma.empresaId, empresaId))
      .orderBy(asc(chatbots.nome), asc(etiquetasPlataforma.nome), asc(etiquetasPlataforma.idExterno));
    // Em destaque primeiro, depois as que aparecem em mais atendimentos (as importadas e nunca vistas vão para o fim)
    return itens.sort(
      (a, b) => a.chatbotNome.localeCompare(b.chatbotNome) || Number(b.destaque) - Number(a.destaque) || b.atendimentos - a.atendimentos,
    );
  })
  .use(protegido({ papel: "admin", empresa: true }))
  /**
   * Importa a lista de etiquetas exportada da plataforma ([{ "id": "706325", "name": "Grow" }, …]).
   * Sem chatbotId, vale para todos os chatbots da empresa. Nomes existentes são atualizados;
   * o destaque escolhido não muda (a etiqueta "Grow" já entra em destaque).
   */
  .post(
    "/importar",
    async ({ body, empresaId, set }) => {
      const bots = await db
        .select({ id: chatbots.id })
        .from(chatbots)
        .where(and(eq(chatbots.empresaId, empresaId), body.chatbotId ? eq(chatbots.id, body.chatbotId) : undefined));
      if (!bots.length) {
        set.status = 404;
        return { erro: "Chatbot não encontrado" };
      }
      const itens = new Map<string, string>();
      for (const i of body.itens) {
        const id = String(i.id ?? "").trim();
        const nome = String(i.name ?? i.nome ?? "").trim().slice(0, 80);
        if (/^\w{1,40}$/.test(id) && nome) itens.set(id, nome);
      }
      if (!itens.size) {
        set.status = 400;
        return { erro: 'Nenhuma etiqueta reconhecida. O formato esperado é [{ "id": "706325", "name": "Grow" }, …]' };
      }
      const antes = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(etiquetasPlataforma)
        .where(and(inArray(etiquetasPlataforma.chatbotId, bots.map((b) => b.id)), inArray(etiquetasPlataforma.idExterno, [...itens.keys()])));
      const linhas = bots.flatMap((b) =>
        [...itens].map(([idExterno, nome]) => ({ empresaId, chatbotId: b.id, idExterno, nome, destaque: nome.toLowerCase() === "grow" })),
      );
      for (let i = 0; i < linhas.length; i += 1000) {
        await db
          .insert(etiquetasPlataforma)
          .values(linhas.slice(i, i + 1000))
          .onConflictDoUpdate({
            target: [etiquetasPlataforma.chatbotId, etiquetasPlataforma.idExterno],
            set: {
              nome: sql`excluded.nome`,
              // Se o nome mudou, a etiqueta é outra coisa: o destaque antigo não vale mais
              destaque: sql`case when ${etiquetasPlataforma.nome} in ('', excluded.nome) then ${etiquetasPlataforma.destaque} or lower(excluded.nome) = 'grow'
                else lower(excluded.nome) = 'grow' end`,
            },
          });
      }
      const atualizadas = antes[0]?.n ?? 0;
      return { importadas: itens.size, chatbots: bots.length, novas: linhas.length - atualizadas, atualizadas };
    },
    {
      body: t.Object({
        chatbotId: t.Optional(t.String({ format: "uuid" })),
        itens: t.Array(t.Object({ id: t.Union([t.String(), t.Number()]), name: t.Optional(t.String()), nome: t.Optional(t.String()) }), {
          maxItems: 10000,
        }),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, empresaId, set }) => {
      const [item] = await db
        .update(etiquetasPlataforma)
        .set({
          ...(body.nome !== undefined && { nome: body.nome.trim() }),
          ...(body.cor !== undefined && { cor: body.cor }),
          ...(body.destaque !== undefined && { destaque: body.destaque }),
        })
        .where(and(eq(etiquetasPlataforma.id, params.id), eq(etiquetasPlataforma.empresaId, empresaId)))
        .returning();
      if (!item) {
        set.status = 404;
        return { erro: "Não encontrada" };
      }
      return item;
    },
    {
      params: paramsId,
      body: t.Object({
        nome: t.Optional(t.String({ maxLength: 80 })),
        cor: t.Optional(t.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
        destaque: t.Optional(t.Boolean()),
      }),
    },
  );
