import { and, asc, desc, eq, gte, ne, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { atendimentos, contatos, mensagens, origens, regrasOrigem } from "../db/schema";
import { protegido } from "../lib/auth";
import { chatbotsPermitidos } from "../lib/filtros";
import { agenteAtivo, acordarOrganizador } from "../services/organizador";
import { aplicarRegras } from "../services/regras";

const paramsId = t.Object({ id: t.String({ format: "uuid" }) });
const corpoRegra = {
  campo: t.Union([t.Literal("etiqueta"), t.Literal("fonte"), t.Literal("canal"), t.Literal("anuncio"), t.Literal("texto")]),
  comparacao: t.Union([t.Literal("igual"), t.Literal("contem")]),
  valor: t.String({ minLength: 1, maxLength: 200 }),
  origem_id: t.String({ format: "uuid" }),
};
const JANELA_REAPLICAR_DIAS = 60;

/**
 * Reavalia as regras nos atendimentos recentes que não foram conferidos por humano.
 * Só o último atendimento de cada contato tem fonte/anúncio (o envio é sobre ele).
 */
export async function reaplicarRegras(empresaId: string) {
  const desde = new Date(Date.now() - JANELA_REAPLICAR_DIAS * 86_400_000);
  const lista = await db
    .select({ at: atendimentos, etiquetas: contatos.etiquetas })
    .from(atendimentos)
    .innerJoin(contatos, eq(contatos.id, atendimentos.contatoId))
    .where(and(eq(atendimentos.empresaId, empresaId), ne(atendimentos.classificacaoStatus, "manual"), gte(atendimentos.ultimaMsgEm, desde)))
    .orderBy(desc(atendimentos.ultimaMsgEm));
  const ultimoDoContato = new Set<string>();
  let alterados = 0;
  for (const { at, etiquetas } of lista) {
    if (ultimoDoContato.has(at.contatoId)) continue;
    ultimoDoContato.add(at.contatoId);
    const textos = await db.select({ texto: mensagens.texto }).from(mensagens).where(eq(mensagens.atendimentoId, at.id));
    const texto = [...textos.map((x) => x.texto), ...Object.values(at.anuncio ?? {})].join("\n");
    const regra = await aplicarRegras(db, empresaId, { etiquetas, fonte: at.fonte, canal: at.canal, anuncioPlataforma: at.anuncioPlataforma, texto });
    if (regra && (regra.id !== at.origemRegraId || regra.origemId !== at.origemId)) {
      await db
        .update(atendimentos)
        .set({
          origemId: regra.origemId,
          origemRegraId: regra.id,
          classificacaoJustificativa: regra.descricao,
          classificacaoConfianca: 1,
          ...(agenteAtivo() && { classificacaoStatus: "pendente" as const, classificacaoTentativas: 0 }),
          atualizadoEm: new Date(),
        })
        .where(eq(atendimentos.id, at.id));
      alterados++;
    } else if (!regra && at.origemRegraId) {
      // A regra que valia saiu: devolve para a IA decidir
      await db
        .update(atendimentos)
        .set({ origemRegraId: null, classificacaoStatus: "pendente", classificacaoTentativas: 0, atualizadoEm: new Date() })
        .where(eq(atendimentos.id, at.id));
      alterados++;
    }
  }
  if (alterados) acordarOrganizador();
  return { analisados: ultimoDoContato.size, alterados };
}

export const rotasRegras = new Elysia({ prefix: "/api/regras" })
  .use(protegido({ empresa: true }))
  .get("/", ({ empresaId, acesso }) =>
    db
      .select({
        id: regrasOrigem.id,
        campo: regrasOrigem.campo,
        comparacao: regrasOrigem.comparacao,
        valor: regrasOrigem.valor,
        origemId: regrasOrigem.origemId,
        origemNome: origens.nome,
        origemCor: origens.cor,
        prioridade: regrasOrigem.prioridade,
        ativo: regrasOrigem.ativo,
        uso: sql<number>`(select count(*)::int from atendimentos a where a.origem_regra_id = "regras_origem"."id"
          and ${chatbotsPermitidos(sql.raw("a.chatbot_id"), acesso.chatbotIds)})`,
      })
      .from(regrasOrigem)
      .innerJoin(origens, eq(origens.id, regrasOrigem.origemId))
      .where(eq(regrasOrigem.empresaId, empresaId))
      .orderBy(asc(regrasOrigem.prioridade), asc(regrasOrigem.criadoEm)),
  )
  .use(protegido({ papel: "admin", empresa: true }))
  .post(
    "/",
    async ({ body, empresaId, set }) => {
      const [origem] = await db.select({ id: origens.id }).from(origens).where(and(eq(origens.id, body.origem_id), eq(origens.empresaId, empresaId)));
      if (!origem) {
        set.status = 400;
        return { erro: "Origem inválida" };
      }
      const [{ max }] = (await db
        .select({ max: sql<number>`coalesce(max(${regrasOrigem.prioridade}), 0)::int` })
        .from(regrasOrigem)
        .where(eq(regrasOrigem.empresaId, empresaId))) as [{ max: number }];
      const [r] = await db
        .insert(regrasOrigem)
        .values({ empresaId, campo: body.campo, comparacao: body.campo === "texto" ? "contem" : body.comparacao, valor: body.valor.trim(), origemId: body.origem_id, prioridade: max + 10 })
        .returning();
      set.status = 201;
      return r;
    },
    { body: t.Object(corpoRegra) },
  )
  .patch(
    "/:id",
    async ({ params, body, empresaId, set }) => {
      const [r] = await db
        .update(regrasOrigem)
        .set({
          ...(body.campo && { campo: body.campo }),
          ...(body.comparacao && { comparacao: body.campo === "texto" ? "contem" : body.comparacao }),
          ...(body.valor && { valor: body.valor.trim() }),
          ...(body.origem_id && { origemId: body.origem_id }),
          ...(body.ativo !== undefined && { ativo: body.ativo }),
        })
        .where(and(eq(regrasOrigem.id, params.id), eq(regrasOrigem.empresaId, empresaId)))
        .returning();
      if (!r) {
        set.status = 404;
        return { erro: "Regra não encontrada" };
      }
      return r;
    },
    { params: paramsId, body: t.Partial(t.Object({ ...corpoRegra, ativo: t.Boolean() })) },
  )
  .delete(
    "/:id",
    async ({ params, empresaId }) => {
      await db.delete(regrasOrigem).where(and(eq(regrasOrigem.id, params.id), eq(regrasOrigem.empresaId, empresaId)));
      return { ok: true };
    },
    { params: paramsId },
  )
  /** Nova ordem: lista de ids, do primeiro ao último */
  .post(
    "/ordem",
    async ({ body, empresaId }) => {
      await db.transaction(async (tx) => {
        for (const [i, id] of body.ids.entries()) {
          await tx.update(regrasOrigem).set({ prioridade: (i + 1) * 10 }).where(and(eq(regrasOrigem.id, id), eq(regrasOrigem.empresaId, empresaId)));
        }
      });
      return { ok: true };
    },
    { body: t.Object({ ids: t.Array(t.String({ format: "uuid" })) }) },
  )
  .post("/reaplicar", ({ empresaId }) => reaplicarRegras(empresaId));
