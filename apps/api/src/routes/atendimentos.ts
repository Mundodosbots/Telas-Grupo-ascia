import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import {
  atendimentoEtiquetas,
  atendimentos,
  atribuicoes,
  clientes,
  empresas,
  etiquetas,
  origens,
  usuarios,
  vendedores,
  webhookEventos,
} from "../db/schema";
import { protegido } from "../lib/auth";
import { condicoesAtendimentos, type FiltroAtendimentos } from "../lib/filtros";
import { agenteAtivo, reenfileirar } from "../services/classificador";

const paramsId = t.Object({ id: t.String({ format: "uuid" }) });

async function etiquetasDe(ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; nome: string; cor: string }[]>();
  const linhas = await db
    .select({ atendimentoId: atendimentoEtiquetas.atendimentoId, id: etiquetas.id, nome: etiquetas.nome, cor: etiquetas.cor })
    .from(atendimentoEtiquetas)
    .innerJoin(etiquetas, eq(etiquetas.id, atendimentoEtiquetas.etiquetaId))
    .where(inArray(atendimentoEtiquetas.atendimentoId, ids))
    .orderBy(asc(etiquetas.nome));
  const mapa = new Map<string, { id: string; nome: string; cor: string }[]>();
  for (const l of linhas) {
    const lista = mapa.get(l.atendimentoId) ?? [];
    lista.push({ id: l.id, nome: l.nome, cor: l.cor });
    mapa.set(l.atendimentoId, lista);
  }
  return mapa;
}

export const rotasAtendimentos = new Elysia({ prefix: "/api/atendimentos" })
  .use(protegido())
  .get("/", async ({ query }) => {
    const filtro = query as FiltroAtendimentos & { pagina?: string; por_pagina?: string };
    const porPagina = Math.min(100, Math.max(1, Number(filtro.por_pagina) || 25));
    const pagina = Math.max(1, Number(filtro.pagina) || 1);
    const onde = and(...condicoesAtendimentos(filtro));

    const [{ total }] = (await db
      .select({ total: sql<number>`count(*)::int` })
      .from(atendimentos)
      .where(onde)) as [{ total: number }];

    const itens = await db
      .select({
        id: atendimentos.id,
        empresaId: atendimentos.empresaId,
        empresaNome: empresas.nome,
        empresaCor: empresas.cor,
        clienteNome: clientes.nome,
        clienteTelefone: clientes.telefone,
        vendedorId: vendedores.id,
        vendedorNome: vendedores.nome,
        origemId: origens.id,
        origemNome: origens.nome,
        origemCor: origens.cor,
        resumo: atendimentos.resumo,
        totalAtribuicoes: atendimentos.totalAtribuicoes,
        ultimaAtribuicaoEm: atendimentos.ultimaAtribuicaoEm,
        status: atendimentos.classificacaoStatus,
        confianca: atendimentos.classificacaoConfianca,
        sugestao: atendimentos.classificacaoSugestao,
      })
      .from(atendimentos)
      .innerJoin(empresas, eq(empresas.id, atendimentos.empresaId))
      .innerJoin(clientes, eq(clientes.id, atendimentos.clienteId))
      .innerJoin(vendedores, eq(vendedores.id, atendimentos.vendedorAtualId))
      .leftJoin(origens, eq(origens.id, atendimentos.origemId))
      .where(onde)
      .orderBy(desc(atendimentos.ultimaAtribuicaoEm))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina);

    const tags = await etiquetasDe(itens.map((i) => i.id));
    return {
      total,
      pagina,
      porPagina,
      itens: itens.map((i) => ({ ...i, etiquetas: tags.get(i.id) ?? [] })),
    };
  })
  .get(
    "/:id",
    async ({ params, set }) => {
      const classificador = alias(usuarios, "classificador");
      const [a] = await db
        .select({
          id: atendimentos.id,
          empresaId: atendimentos.empresaId,
          empresaNome: empresas.nome,
          empresaCor: empresas.cor,
          clienteId: clientes.id,
          clienteNome: clientes.nome,
          clienteTelefone: clientes.telefone,
          conversaId: atendimentos.conversaIdExterno,
          vendedorId: vendedores.id,
          vendedorNome: vendedores.nome,
          origemId: atendimentos.origemId,
          origemNome: origens.nome,
          origemCor: origens.cor,
          resumo: atendimentos.resumo,
          fonteInformada: atendimentos.fonteInformada,
          totalAtribuicoes: atendimentos.totalAtribuicoes,
          primeiraAtribuicaoEm: atendimentos.primeiraAtribuicaoEm,
          ultimaAtribuicaoEm: atendimentos.ultimaAtribuicaoEm,
          status: atendimentos.classificacaoStatus,
          confianca: atendimentos.classificacaoConfianca,
          justificativa: atendimentos.classificacaoJustificativa,
          sugestao: atendimentos.classificacaoSugestao,
          erro: atendimentos.classificacaoErro,
          tentativas: atendimentos.classificacaoTentativas,
          classificadoEm: atendimentos.classificadoEm,
          classificadoPor: classificador.nome,
        })
        .from(atendimentos)
        .innerJoin(empresas, eq(empresas.id, atendimentos.empresaId))
        .innerJoin(clientes, eq(clientes.id, atendimentos.clienteId))
        .innerJoin(vendedores, eq(vendedores.id, atendimentos.vendedorAtualId))
        .leftJoin(origens, eq(origens.id, atendimentos.origemId))
        .leftJoin(classificador, eq(classificador.id, atendimentos.classificadoPorUsuarioId))
        .where(eq(atendimentos.id, params.id));
      if (!a) {
        set.status = 404;
        return { erro: "Atendimento não encontrado" };
      }

      const linhaDoTempo = await db
        .select({
          id: atribuicoes.id,
          vendedorId: vendedores.id,
          vendedorNome: vendedores.nome,
          resumo: atribuicoes.resumo,
          fonte: atribuicoes.fonte,
          dadosExtras: atribuicoes.dadosExtras,
          atribuidoEm: atribuicoes.atribuidoEm,
          eventoId: atribuicoes.eventoId,
          payload: webhookEventos.payload,
        })
        .from(atribuicoes)
        .innerJoin(vendedores, eq(vendedores.id, atribuicoes.vendedorId))
        .leftJoin(webhookEventos, eq(webhookEventos.id, atribuicoes.eventoId))
        .where(eq(atribuicoes.atendimentoId, a.id))
        .orderBy(asc(atribuicoes.atribuidoEm));

      // Outros atendimentos do mesmo cliente (fora da janela de reatribuição)
      const anteriores = await db
        .select({
          id: atendimentos.id,
          ultimaAtribuicaoEm: atendimentos.ultimaAtribuicaoEm,
          vendedorNome: vendedores.nome,
        })
        .from(atendimentos)
        .innerJoin(vendedores, eq(vendedores.id, atendimentos.vendedorAtualId))
        .where(and(eq(atendimentos.clienteId, a.clienteId), sql`${atendimentos.id} <> ${a.id}`))
        .orderBy(desc(atendimentos.ultimaAtribuicaoEm))
        .limit(10);

      const tags = await etiquetasDe([a.id]);
      return { ...a, etiquetas: tags.get(a.id) ?? [], linhaDoTempo, outrosAtendimentos: anteriores };
    },
    { params: paramsId },
  )
  /** Classificação manual: o agente não mexe mais neste atendimento */
  .patch(
    "/:id",
    async ({ params, body, usuario, set }) => {
      const r = await db.transaction(async (tx) => {
        const [a] = await tx
          .update(atendimentos)
          .set({
            ...(body.origem_id !== undefined && { origemId: body.origem_id }),
            classificacaoStatus: "manual",
            classificacaoSugestao: null,
            classificadoEm: new Date(),
            classificadoPorUsuarioId: usuario.id,
            atualizadoEm: new Date(),
          })
          .where(eq(atendimentos.id, params.id))
          .returning({ id: atendimentos.id });
        if (!a) return null;
        if (body.etiqueta_ids) {
          await tx.delete(atendimentoEtiquetas).where(eq(atendimentoEtiquetas.atendimentoId, a.id));
          const ids = [...new Set(body.etiqueta_ids)];
          if (ids.length) await tx.insert(atendimentoEtiquetas).values(ids.map((etiquetaId) => ({ atendimentoId: a.id, etiquetaId })));
        }
        return a;
      });
      if (!r) {
        set.status = 404;
        return { erro: "Atendimento não encontrado" };
      }
      return { ok: true };
    },
    {
      params: paramsId,
      body: t.Object({
        origem_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
        etiqueta_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
      }),
    },
  )
  .post(
    "/:id/reclassificar",
    async ({ params, set }) => {
      if (!agenteAtivo()) {
        set.status = 409;
        return { erro: "O agente de IA está desligado (OPENAI_API_KEY não configurada)" };
      }
      await reenfileirar([params.id]);
      return { ok: true };
    },
    { params: paramsId },
  )
  /** Devolve à fila do agente todos os que falharam */
  .post("/reprocessar-erros", async ({ set }) => {
    if (!agenteAtivo()) {
      set.status = 409;
      return { erro: "O agente de IA está desligado (OPENAI_API_KEY não configurada)" };
    }
    const ids = await db.select({ id: atendimentos.id }).from(atendimentos).where(eq(atendimentos.classificacaoStatus, "erro"));
    await reenfileirar(ids.map((i) => i.id));
    return { ok: true, total: ids.length };
  });
