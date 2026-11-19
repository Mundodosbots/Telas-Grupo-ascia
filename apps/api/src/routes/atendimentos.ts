import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import {
  atendentes,
  atendimentoAtendentes,
  atendimentoEtiquetas,
  atendimentos,
  chatbots,
  contatos,
  departamentos,
  etiquetas,
  mensagens,
  origens,
  usuarios,
} from "../db/schema";
import { protegido } from "../lib/auth";
import { condicoesAtendimentos, type FiltroAtendimentos } from "../lib/filtros";
import { marcarEsperas } from "../services/historico";
import { reorganizar } from "../services/organizador";

const paramsId = t.Object({ id: t.String({ format: "uuid" }) });

/** Ordem da lista: mais recentes (padrão) ou os piores casos primeiro */
const ORDENS = {
  recentes: [desc(atendimentos.inicioEm)],
  espera: [sql`${atendimentos.tempoMaxRespostaS} desc nulls last`, desc(atendimentos.esperasAcima30), desc(atendimentos.inicioEm)],
  humano: [sql`${atendimentos.semHumano} desc`, sql`${atendimentos.tempoAteHumanoS} desc nulls last`, desc(atendimentos.inicioEm)],
  resposta: [sql`${atendimentos.tempoMedioRespostaS} desc nulls last`, desc(atendimentos.inicioEm)],
  antigos: [asc(atendimentos.inicioEm)],
} as const;
const ordemDe = (o?: string) => ORDENS[(o ?? "") as keyof typeof ORDENS] ?? ORDENS.recentes;
const LIMITE_RELATORIO = 5000;

async function etiquetasDe(ids: string[]) {
  const mapa = new Map<string, { id: string; nome: string; cor: string }[]>();
  if (!ids.length) return mapa;
  const linhas = await db
    .select({ atendimentoId: atendimentoEtiquetas.atendimentoId, id: etiquetas.id, nome: etiquetas.nome, cor: etiquetas.cor })
    .from(atendimentoEtiquetas)
    .innerJoin(etiquetas, eq(etiquetas.id, atendimentoEtiquetas.etiquetaId))
    .where(inArray(atendimentoEtiquetas.atendimentoId, ids))
    .orderBy(asc(etiquetas.nome));
  for (const l of linhas) mapa.set(l.atendimentoId, [...(mapa.get(l.atendimentoId) ?? []), { id: l.id, nome: l.nome, cor: l.cor }]);
  return mapa;
}

/** Colunas da lista (sem conversa) */
const colunasLista = {
  id: atendimentos.id,
  protocolo: atendimentos.protocolo,
  chatbotId: atendimentos.chatbotId,
  chatbotNome: chatbots.nome,
  chatbotCor: chatbots.cor,
  contatoNome: contatos.nome,
  contatoTelefone: contatos.telefone,
  atendenteId: atendimentos.atendenteId,
  atendenteNome: atendentes.nome,
  origemId: atendimentos.origemId,
  origemNome: origens.nome,
  origemCor: origens.cor,
  departamentoNome: departamentos.nome,
  departamentoCor: departamentos.cor,
  cidade: atendimentos.cidade,
  canal: atendimentos.canal,
  fonte: atendimentos.fonte,
  interesse: atendimentos.interesse,
  resumo: atendimentos.resumo,
  inicioEm: atendimentos.inicioEm,
  ultimaMsgEm: atendimentos.ultimaMsgEm,
  precisouHumano: atendimentos.precisouHumano,
  semHumano: atendimentos.semHumano,
  atendidoAte30: atendimentos.atendidoAte30,
  tempoAteHumanoS: atendimentos.tempoAteHumanoS,
  tempoMedioRespostaS: atendimentos.tempoMedioRespostaS,
  tempoMaxRespostaS: atendimentos.tempoMaxRespostaS,
  semResposta: atendimentos.semResposta,
  esperasAcima30: atendimentos.esperasAcima30,
  transferencias: atendimentos.transferencias,
  leadNovo: atendimentos.leadNovo,
  status: atendimentos.classificacaoStatus,
};

function consultaLista(onde: ReturnType<typeof and>) {
  return db
    .select(colunasLista)
    .from(atendimentos)
    .innerJoin(chatbots, eq(chatbots.id, atendimentos.chatbotId))
    .innerJoin(contatos, eq(contatos.id, atendimentos.contatoId))
    .leftJoin(atendentes, eq(atendentes.id, atendimentos.atendenteId))
    .leftJoin(origens, eq(origens.id, atendimentos.origemId))
    .leftJoin(departamentos, eq(departamentos.id, atendimentos.departamentoId))
    .where(onde);
}

export const rotasAtendimentos = new Elysia({ prefix: "/api/atendimentos" })
  .use(protegido({ empresa: true }))
  .get("/", async ({ query, empresaId }) => {
    const f = query as FiltroAtendimentos & { pagina?: string; por_pagina?: string; ordem?: string };
    const porPagina = Math.min(100, Math.max(1, Number(f.por_pagina) || 25));
    const pagina = Math.max(1, Number(f.pagina) || 1);
    const onde = and(...condicoesAtendimentos(empresaId, f));
    const [{ total }] = (await db.select({ total: sql<number>`count(*)::int` }).from(atendimentos).where(onde)) as [{ total: number }];
    const itens = await consultaLista(onde)
      .orderBy(...ordemDe(f.ordem))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina);
    const tags = await etiquetasDe(itens.map((i) => i.id));
    return { total, pagina, porPagina, itens: itens.map((i) => ({ ...i, etiquetas: tags.get(i.id) ?? [] })) };
  })
  /** Lista completa (sem paginação) para relatórios e planilha */
  .get("/relatorio", async ({ query, empresaId }) => {
    const onde = and(...condicoesAtendimentos(empresaId, query as FiltroAtendimentos));
    const [{ total }] = (await db.select({ total: sql<number>`count(*)::int` }).from(atendimentos).where(onde)) as [{ total: number }];
    const itens = await consultaLista(onde).orderBy(...ordemDe((query as { ordem?: string }).ordem)).limit(LIMITE_RELATORIO);
    const tags = await etiquetasDe(itens.map((i) => i.id));
    return { total, limite: LIMITE_RELATORIO, itens: itens.map((i) => ({ ...i, etiquetas: (tags.get(i.id) ?? []).map((e) => e.nome) })) };
  })
  .get(
    "/:id",
    async ({ params, empresaId, set }) => {
      const quemClassificou = alias(usuarios, "quem_classificou");
      const [a] = await db
        .select({
          at: atendimentos,
          contato: contatos,
          chatbotNome: chatbots.nome,
          chatbotCor: chatbots.cor,
          fuso: chatbots.fuso,
          horario: chatbots.horario,
          atendenteNome: atendentes.nome,
          origemNome: origens.nome,
          origemCor: origens.cor,
          departamentoNome: departamentos.nome,
          departamentoCor: departamentos.cor,
          classificadoPor: quemClassificou.nome,
        })
        .from(atendimentos)
        .innerJoin(contatos, eq(contatos.id, atendimentos.contatoId))
        .innerJoin(chatbots, eq(chatbots.id, atendimentos.chatbotId))
        .leftJoin(atendentes, eq(atendentes.id, atendimentos.atendenteId))
        .leftJoin(origens, eq(origens.id, atendimentos.origemId))
        .leftJoin(departamentos, eq(departamentos.id, atendimentos.departamentoId))
        .leftJoin(quemClassificou, eq(quemClassificou.id, atendimentos.classificadoPorUsuarioId))
        .where(and(eq(atendimentos.id, params.id), eq(atendimentos.empresaId, empresaId)));
      if (!a) {
        set.status = 404;
        return { erro: "Atendimento não encontrado" };
      }
      const conversa = await db
        .select({ id: mensagens.id, em: mensagens.enviadaEm, tipo: mensagens.remetenteTipo, remetente: mensagens.remetenteNome, texto: mensagens.texto })
        .from(mensagens)
        .where(eq(mensagens.atendimentoId, params.id))
        .orderBy(asc(mensagens.enviadaEm), asc(mensagens.seq));
      const humanos = await db
        .select({ atendenteId: atendimentoAtendentes.atendenteId, nome: atendentes.nome, ordem: atendimentoAtendentes.ordem, primeiraMsgEm: atendimentoAtendentes.primeiraMsgEm, mensagens: atendimentoAtendentes.mensagens })
        .from(atendimentoAtendentes)
        .innerJoin(atendentes, eq(atendentes.id, atendimentoAtendentes.atendenteId))
        .where(eq(atendimentoAtendentes.atendimentoId, params.id))
        .orderBy(asc(atendimentoAtendentes.ordem));
      // Outros atendimentos do mesmo contato (histórico)
      const outros = await db
        .select({ id: atendimentos.id, protocolo: atendimentos.protocolo, inicioEm: atendimentos.inicioEm, origemNome: origens.nome, atendenteNome: atendentes.nome })
        .from(atendimentos)
        .leftJoin(origens, eq(origens.id, atendimentos.origemId))
        .leftJoin(atendentes, eq(atendentes.id, atendimentos.atendenteId))
        .where(and(eq(atendimentos.contatoId, a.at.contatoId), sql`${atendimentos.id} <> ${params.id}`))
        .orderBy(desc(atendimentos.inicioEm))
        .limit(20);
      const tags = await etiquetasDe([params.id]);
      return {
        ...a.at,
        contato: { id: a.contato.id, nome: a.contato.nome, telefone: a.contato.telefone, cidade: a.contato.cidade, linkConversa: a.contato.linkConversa, criadoNaPlataformaEm: a.contato.criadoNaPlataformaEm, etiquetas: a.contato.etiquetas, campos: a.contato.campos },
        chatbotNome: a.chatbotNome,
        chatbotCor: a.chatbotCor,
        fuso: a.fuso,
        atendenteNome: a.atendenteNome,
        origemNome: a.origemNome,
        origemCor: a.origemCor,
        origemPorRegra: !!a.at.origemRegraId,
        departamentoNome: a.departamentoNome,
        departamentoCor: a.departamentoCor,
        classificadoPor: a.classificadoPor,
        etiquetas: tags.get(params.id) ?? [],
        humanos,
        conversa: marcarEsperas(conversa, a.horario, a.fuso),
        outros,
      };
    },
    { params: paramsId },
  )
  /** Correção manual: o agente não mexe mais neste atendimento */
  .patch(
    "/:id",
    async ({ params, body, usuario, empresaId, set }) => {
      const [a] = await db.select({ id: atendimentos.id }).from(atendimentos).where(and(eq(atendimentos.id, params.id), eq(atendimentos.empresaId, empresaId)));
      if (!a) {
        set.status = 404;
        return { erro: "Atendimento não encontrado" };
      }
      await db.transaction(async (tx) => {
        await tx
          .update(atendimentos)
          .set({
            ...(body.origem_id !== undefined && { origemId: body.origem_id, origemRegraId: null }),
            ...(body.departamento_id !== undefined && { departamentoId: body.departamento_id }),
            ...(body.cidade !== undefined && { cidade: body.cidade?.trim() || null }),
            classificacaoStatus: "manual",
            classificadoPorUsuarioId: usuario.id,
            classificadoEm: new Date(),
            atualizadoEm: new Date(),
          })
          .where(eq(atendimentos.id, params.id));
        if (body.etiqueta_ids) {
          await tx.delete(atendimentoEtiquetas).where(eq(atendimentoEtiquetas.atendimentoId, params.id));
          if (body.etiqueta_ids.length) await tx.insert(atendimentoEtiquetas).values(body.etiqueta_ids.map((etiquetaId) => ({ atendimentoId: params.id, etiquetaId })));
        }
      });
      return { ok: true };
    },
    {
      params: paramsId,
      body: t.Object({
        origem_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
        departamento_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
        cidade: t.Optional(t.Nullable(t.String())),
        etiqueta_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
      }),
    },
  )
  /** Devolve para o agente organizar de novo */
  .post(
    "/:id/reorganizar",
    async ({ params, empresaId, set }) => {
      const [a] = await db.select({ id: atendimentos.id }).from(atendimentos).where(and(eq(atendimentos.id, params.id), eq(atendimentos.empresaId, empresaId)));
      if (!a) {
        set.status = 404;
        return { erro: "Atendimento não encontrado" };
      }
      await reorganizar([params.id]);
      return { ok: true };
    },
    { params: paramsId },
  );
