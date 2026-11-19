import { and, asc, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { atendentes, atendimentoAtendentes, atendimentos, mensagens, times } from "../db/schema";
import { protegido } from "../lib/auth";
import { ehUuid } from "../lib/util";
import { nomeDeAtendente } from "../services/ingestao";

const paramsId = t.Object({ id: t.String({ format: "uuid" }) });

/** Atendentes humanos (criados sozinhos quando aparecem nos envios) */
export const rotasAtendentes = new Elysia({ prefix: "/api/atendentes" })
  .use(protegido({ empresa: true }))
  .get("/", ({ empresaId }) =>
    db
      .select({
        id: atendentes.id,
        nome: atendentes.nome,
        email: atendentes.email,
        idExterno: atendentes.idExterno,
        apelidos: atendentes.apelidos,
        ativo: atendentes.ativo,
        timeId: atendentes.timeId,
        timeNome: times.nome,
        timeCor: times.cor,
        atendimentos: sql<number>`(select count(*)::int from atendimentos a where a.atendente_id = "atendentes"."id")`,
        ultimoAtendimento: sql<string | null>`(select max(a.ultima_msg_em) from atendimentos a where a.atendente_id = "atendentes"."id")`,
      })
      .from(atendentes)
      .leftJoin(times, eq(times.id, atendentes.timeId))
      .where(eq(atendentes.empresaId, empresaId))
      .orderBy(asc(atendentes.nome)),
  )
  .use(protegido({ papel: "admin", empresa: true }))
  .patch(
    "/:id",
    async ({ params, body, empresaId, set }) => {
      if (body.time_id && !ehUuid(body.time_id)) {
        set.status = 400;
        return { erro: "Time inválido" };
      }
      try {
        const [a] = await db
          .update(atendentes)
          .set({
            ...(body.nome !== undefined && { nome: body.nome.trim(), nomeNormalizado: nomeDeAtendente(body.nome) }),
            ...(body.email !== undefined && { email: body.email || null }),
            ...(body.time_id !== undefined && { timeId: body.time_id || null }),
            ...(body.ativo !== undefined && { ativo: body.ativo }),
          })
          .where(and(eq(atendentes.id, params.id), eq(atendentes.empresaId, empresaId)))
          .returning();
        if (!a) {
          set.status = 404;
          return { erro: "Atendente não encontrado" };
        }
        return a;
      } catch {
        set.status = 409;
        return { erro: "Já existe um atendente com esse nome. Use 'mesclar'." };
      }
    },
    {
      params: paramsId,
      body: t.Object({
        nome: t.Optional(t.String({ minLength: 1 })),
        email: t.Optional(t.String()),
        time_id: t.Optional(t.Nullable(t.String())),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  /** Junta um atendente duplicado (ex.: "OSVALDO" e "OSVALDO JUNIOR") no destino */
  .post(
    "/:id/mesclar",
    async ({ params, body, empresaId, set }) => {
      if (params.id === body.destino_id) {
        set.status = 400;
        return { erro: "Escolha um atendente diferente" };
      }
      const [origem] = await db.select().from(atendentes).where(and(eq(atendentes.id, params.id), eq(atendentes.empresaId, empresaId)));
      const [destino] = await db.select().from(atendentes).where(and(eq(atendentes.id, body.destino_id), eq(atendentes.empresaId, empresaId)));
      if (!origem || !destino) {
        set.status = 404;
        return { erro: "Atendente não encontrado" };
      }
      await db.transaction(async (tx) => {
        await tx.update(atendimentos).set({ atendenteId: destino.id }).where(eq(atendimentos.atendenteId, origem.id));
        await tx.update(atendimentos).set({ primeiroAtendenteId: destino.id }).where(eq(atendimentos.primeiroAtendenteId, origem.id));
        await tx.update(mensagens).set({ atendenteId: destino.id }).where(eq(mensagens.atendenteId, origem.id));
        // Participação: se os dois falaram no mesmo atendimento, fica a do destino
        await tx.execute(sql`delete from atendimento_atendentes o using atendimento_atendentes d
          where o.atendente_id = ${origem.id} and d.atendente_id = ${destino.id} and o.atendimento_id = d.atendimento_id`);
        await tx.update(atendimentoAtendentes).set({ atendenteId: destino.id }).where(eq(atendimentoAtendentes.atendenteId, origem.id));
        await tx.delete(atendentes).where(eq(atendentes.id, origem.id));
        const apelidos = [...new Set([...destino.apelidos, ...origem.apelidos, origem.nomeNormalizado])].filter((x) => x !== destino.nomeNormalizado);
        await tx
          .update(atendentes)
          .set({ apelidos, ...(origem.idExterno && !destino.idExterno && { idExterno: origem.idExterno }) })
          .where(eq(atendentes.id, destino.id));
      });
      return { ok: true };
    },
    { params: paramsId, body: t.Object({ destino_id: t.String({ format: "uuid" }) }) },
  );
