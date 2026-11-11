import { and, asc, eq, ne, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { atendimentos, dicionarioEtiquetas, empresas, origens, regrasOrigem } from "../db/schema";
import { protegido } from "../lib/auth";
import { acordarAgente, agenteAtivo } from "../services/classificador";
import { aplicarRegras } from "../services/ingestao";

const paramsId = t.Object({ id: t.String({ format: "uuid" }) });
const corpoRegra = {
  empresa_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
  campo: t.Union([t.Literal("etiqueta"), t.Literal("fonte")]),
  comparacao: t.Union([t.Literal("igual"), t.Literal("contem")]),
  valor: t.String({ minLength: 1, maxLength: 200 }),
  origem_id: t.String({ format: "uuid" }),
};

/**
 * Reavalia atendimentos não conferidos por humano:
 * - traduz etiquetas que estavam só com o ID (#123) usando o dicionário atual
 * - aplica as regras; quem deixou de bater em regra volta para a IA
 */
export async function reaplicarRegras(empresaId?: string) {
  const lista = await db
    .select({
      id: atendimentos.id,
      empresaId: atendimentos.empresaId,
      etiquetas: atendimentos.etiquetasPlataforma,
      fonte: atendimentos.fonteInformada,
      origemId: atendimentos.origemId,
      origemRegraId: atendimentos.origemRegraId,
    })
    .from(atendimentos)
    .where(and(ne(atendimentos.classificacaoStatus, "manual"), empresaId ? eq(atendimentos.empresaId, empresaId) : undefined));

  const dicionarios = new Map<string, Map<string, string>>();
  let alterados = 0;
  for (const a of lista) {
    if (!dicionarios.has(a.empresaId)) {
      const linhas = await db.select().from(dicionarioEtiquetas).where(eq(dicionarioEtiquetas.empresaId, a.empresaId));
      dicionarios.set(a.empresaId, new Map(linhas.map((l) => [l.idExterno, l.nome])));
    }
    const dic = dicionarios.get(a.empresaId)!;
    const etiquetas = a.etiquetas.map((e) => (e.startsWith("#") ? (dic.get(e.slice(1)) ?? e) : e));
    const regra = await aplicarRegras(db, a.empresaId, etiquetas, a.fonte ?? undefined);
    const mudouEtiquetas = etiquetas.join("|") !== a.etiquetas.join("|");

    if (regra && (regra.id !== a.origemRegraId || regra.origemId !== a.origemId)) {
      await db
        .update(atendimentos)
        .set({
          etiquetasPlataforma: etiquetas,
          origemId: regra.origemId,
          origemRegraId: regra.id,
          classificacaoStatus: agenteAtivo() ? "pendente" : "classificado",
          classificacaoConfianca: 1,
          classificacaoJustificativa: regra.descricao,
          classificacaoSugestao: null,
          classificacaoTentativas: 0,
          classificadoEm: new Date(),
          atualizadoEm: new Date(),
        })
        .where(eq(atendimentos.id, a.id));
      alterados++;
    } else if (!regra && a.origemRegraId) {
      // A regra que valia foi removida/desativada: devolve para a IA decidir
      await db
        .update(atendimentos)
        .set({ etiquetasPlataforma: etiquetas, origemRegraId: null, classificacaoStatus: "pendente", classificacaoTentativas: 0, atualizadoEm: new Date() })
        .where(eq(atendimentos.id, a.id));
      alterados++;
    } else if (mudouEtiquetas) {
      await db.update(atendimentos).set({ etiquetasPlataforma: etiquetas, atualizadoEm: new Date() }).where(eq(atendimentos.id, a.id));
    }
  }
  if (alterados) acordarAgente();
  return { analisados: lista.length, alterados };
}

export const rotasRegras = new Elysia({ prefix: "/api/regras" })
  .use(protegido())
  .get("/", async () => {
    const linhas = await db
      .select({
        id: regrasOrigem.id,
        empresaId: regrasOrigem.empresaId,
        empresaNome: empresas.nome,
        campo: regrasOrigem.campo,
        comparacao: regrasOrigem.comparacao,
        valor: regrasOrigem.valor,
        origemId: regrasOrigem.origemId,
        origemNome: origens.nome,
        origemCor: origens.cor,
        prioridade: regrasOrigem.prioridade,
        ativo: regrasOrigem.ativo,
        uso: sql<number>`(select count(*)::int from atendimentos a where a.origem_regra_id = ${regrasOrigem.id})`,
      })
      .from(regrasOrigem)
      .innerJoin(origens, eq(origens.id, regrasOrigem.origemId))
      .leftJoin(empresas, eq(empresas.id, regrasOrigem.empresaId))
      .orderBy(asc(regrasOrigem.prioridade), asc(regrasOrigem.criadoEm));
    return linhas;
  })
  .post(
    "/",
    async ({ body, set }) => {
      const [{ max }] = (await db.select({ max: sql<number>`coalesce(max(${regrasOrigem.prioridade}), 0)::int` }).from(regrasOrigem)) as [
        { max: number },
      ];
      const [r] = await db
        .insert(regrasOrigem)
        .values({
          empresaId: body.empresa_id ?? null,
          campo: body.campo,
          comparacao: body.comparacao,
          valor: body.valor.trim(),
          origemId: body.origem_id,
          prioridade: max + 10,
        })
        .returning();
      set.status = 201;
      return r;
    },
    { body: t.Object(corpoRegra) },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const [r] = await db
        .update(regrasOrigem)
        .set({
          ...(body.empresa_id !== undefined && { empresaId: body.empresa_id }),
          ...(body.campo && { campo: body.campo }),
          ...(body.comparacao && { comparacao: body.comparacao }),
          ...(body.valor && { valor: body.valor.trim() }),
          ...(body.origem_id && { origemId: body.origem_id }),
          ...(body.ativo !== undefined && { ativo: body.ativo }),
        })
        .where(eq(regrasOrigem.id, params.id))
        .returning();
      if (!r) {
        set.status = 404;
        return { erro: "Regra não encontrada" };
      }
      return r;
    },
    {
      params: paramsId,
      body: t.Object({
        empresa_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
        campo: t.Optional(corpoRegra.campo),
        comparacao: t.Optional(corpoRegra.comparacao),
        valor: t.Optional(corpoRegra.valor),
        origem_id: t.Optional(corpoRegra.origem_id),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ params }) => {
      await db.delete(regrasOrigem).where(eq(regrasOrigem.id, params.id));
      return { ok: true };
    },
    { params: paramsId },
  )
  /** Nova ordem de prioridade: a primeira da lista vale mais */
  .post(
    "/ordem",
    async ({ body }) => {
      await db.transaction(async (tx) => {
        for (const [i, id] of body.ids.entries()) {
          await tx.update(regrasOrigem).set({ prioridade: (i + 1) * 10 }).where(eq(regrasOrigem.id, id));
        }
      });
      return { ok: true };
    },
    { body: t.Object({ ids: t.Array(t.String({ format: "uuid" })) }) },
  )
  .post("/reaplicar", () => reaplicarRegras());

/** Dicionário ID → nome das etiquetas da plataforma, por empresa */
export const rotasDicionario = new Elysia({ prefix: "/api/empresas/:id/etiquetas-plataforma" })
  .use(protegido())
  .get(
    "/",
    ({ params }) =>
      db
        .select({ id: dicionarioEtiquetas.idExterno, nome: dicionarioEtiquetas.nome })
        .from(dicionarioEtiquetas)
        .where(eq(dicionarioEtiquetas.empresaId, params.id))
        .orderBy(asc(dicionarioEtiquetas.nome)),
    { params: paramsId },
  )
  /** Importa a lista exportada da plataforma: [{ "id": "706325", "name": "Grow" }, ...] */
  .post(
    "/",
    async ({ params, body, set }) => {
      const itens = body.itens
        .map((i) => ({ id: String(i.id ?? "").trim(), nome: String(i.name ?? i.nome ?? "").trim() }))
        .filter((i) => i.id && i.nome);
      if (!itens.length) {
        set.status = 400;
        return { erro: "Nenhuma etiqueta válida. O formato esperado é uma lista com id e name." };
      }
      await db.transaction(async (tx) => {
        for (let i = 0; i < itens.length; i += 500) {
          await tx
            .insert(dicionarioEtiquetas)
            .values(itens.slice(i, i + 500).map((x) => ({ empresaId: params.id, idExterno: x.id, nome: x.nome })))
            .onConflictDoUpdate({
              target: [dicionarioEtiquetas.empresaId, dicionarioEtiquetas.idExterno],
              set: { nome: sql`excluded.nome`, atualizadoEm: new Date() },
            });
        }
      });
      const reaplicado = await reaplicarRegras(params.id);
      return { ok: true, importadas: itens.length, ...reaplicado };
    },
    {
      params: paramsId,
      body: t.Object({ itens: t.Array(t.Object({ id: t.Union([t.String(), t.Number()]), name: t.Optional(t.String()), nome: t.Optional(t.String()) })) }),
    },
  );

