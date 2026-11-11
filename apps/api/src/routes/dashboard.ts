import { and, desc, eq, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db/client";
import { atendimentoEtiquetas, atendimentos, empresas, etiquetas, origens, vendedores, webhookEventos } from "../db/schema";
import { env } from "../env";
import { protegido } from "../lib/auth";
import { condicoesAtendimentos, type FiltroAtendimentos } from "../lib/filtros";
import { agenteAtivo } from "../services/classificador";

const n = sql<number>`count(*)::int`;

export const rotasDashboard = new Elysia({ prefix: "/api" })
  .use(protegido())
  /**
   * Todas as métricas do painel num só pedido.
   * A contagem é sempre do vendedor ATUAL (último atribuído) e o período
   * olha a data da última atribuição.
   */
  .get("/dashboard", async ({ query }) => {
    const filtro = query as FiltroAtendimentos;
    const onde = and(...condicoesAtendimentos(filtro));

    const [resumo] = await db
      .select({
        total: n,
        aRevisar: sql<number>`count(*) filter (where ${atendimentos.classificacaoStatus} in ('revisar','erro'))::int`,
        pendentes: sql<number>`count(*) filter (where ${atendimentos.classificacaoStatus} in ('pendente','processando'))::int`,
        semOrigem: sql<number>`count(*) filter (where ${atendimentos.origemId} is null)::int`,
        reatribuidos: sql<number>`count(*) filter (where ${atendimentos.totalAtribuicoes} > 1)::int`,
        classificadosIa: sql<number>`count(*) filter (where ${atendimentos.classificacaoStatus} = 'classificado')::int`,
        vendedores: sql<number>`count(distinct ${atendimentos.vendedorAtualId})::int`,
      })
      .from(atendimentos)
      .where(onde);

    const porEmpresa = await db
      .select({ id: empresas.id, nome: empresas.nome, cor: empresas.cor, total: n })
      .from(atendimentos)
      .innerJoin(empresas, eq(empresas.id, atendimentos.empresaId))
      .where(onde)
      .groupBy(empresas.id)
      .orderBy(desc(n));

    const porVendedor = await db
      .select({
        id: vendedores.id,
        nome: vendedores.nome,
        empresaId: empresas.id,
        empresaNome: empresas.nome,
        empresaCor: empresas.cor,
        total: n,
        reatribuidos: sql<number>`count(*) filter (where ${atendimentos.totalAtribuicoes} > 1)::int`,
      })
      .from(atendimentos)
      .innerJoin(vendedores, eq(vendedores.id, atendimentos.vendedorAtualId))
      .innerJoin(empresas, eq(empresas.id, vendedores.empresaId))
      .where(onde)
      .groupBy(vendedores.id, empresas.id)
      .orderBy(desc(n), vendedores.nome);

    const porOrigem = await db
      .select({ id: origens.id, nome: origens.nome, cor: origens.cor, total: n })
      .from(atendimentos)
      .leftJoin(origens, eq(origens.id, atendimentos.origemId))
      .where(onde)
      .groupBy(origens.id)
      .orderBy(desc(n));

    const porEtiqueta = await db
      .select({ id: etiquetas.id, nome: etiquetas.nome, cor: etiquetas.cor, total: n })
      .from(atendimentos)
      .innerJoin(atendimentoEtiquetas, eq(atendimentoEtiquetas.atendimentoId, atendimentos.id))
      .innerJoin(etiquetas, eq(etiquetas.id, atendimentoEtiquetas.etiquetaId))
      .where(onde)
      .groupBy(etiquetas.id)
      .orderBy(desc(n))
      .limit(15);

    const dia = sql<string>`to_char(${atendimentos.ultimaAtribuicaoEm} at time zone ${env.TZ_RELATORIOS}, 'YYYY-MM-DD')`;
    const serie = await db
      .select({ dia, empresaId: atendimentos.empresaId, total: n })
      .from(atendimentos)
      .where(onde)
      // Agrupa pela posição: o fuso entra como parâmetro e o Postgres não casaria a expressão repetida
      .groupBy(sql`1`, atendimentos.empresaId)
      .orderBy(sql`1`);

    /** Vendedor × origem: "quantos do Carlos vieram de marketing?" */
    const vendedorOrigem = await db
      .select({ vendedorId: atendimentos.vendedorAtualId, origemId: atendimentos.origemId, total: n })
      .from(atendimentos)
      .where(onde)
      .groupBy(atendimentos.vendedorAtualId, atendimentos.origemId);

    return { resumo, porEmpresa, porVendedor, porOrigem, porEtiqueta, serie, vendedorOrigem };
  })
  /** Situação geral para avisos no topo da tela */
  .get("/status", async () => {
    const [fila] = await db
      .select({
        pendentes: sql<number>`count(*) filter (where ${atendimentos.classificacaoStatus} in ('pendente','processando'))::int`,
        aRevisar: sql<number>`count(*) filter (where ${atendimentos.classificacaoStatus} in ('revisar','erro'))::int`,
      })
      .from(atendimentos);
    const [ultimoEvento] = await db
      .select({ recebidoEm: webhookEventos.recebidoEm, status: webhookEventos.status })
      .from(webhookEventos)
      .orderBy(desc(webhookEventos.recebidoEm))
      .limit(1);
    return {
      agenteAtivo: agenteAtivo(),
      modelo: agenteAtivo() ? env.OPENAI_MODEL : null,
      fusoHorario: env.TZ_RELATORIOS,
      ...fila,
      ultimoEvento: ultimoEvento ?? null,
    };
  });
