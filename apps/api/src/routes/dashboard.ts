import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db/client";
import { atendimentos, webhookEventos } from "../db/schema";
import { env } from "../env";
import { protegido } from "../lib/auth";
import { condicoesAtendimentos, type FiltroAtendimentos } from "../lib/filtros";
import { agenteAtivo } from "../services/organizador";

/** Mesmas métricas para o total e para cada agrupamento */
const METRICAS = sql.raw(`
  count(*)::int as total,
  count(*) filter (where a.precisou_humano)::int as humano,
  count(*) filter (where a.sem_humano)::int as sem_humano,
  count(*) filter (where a.atendido_ate_30)::int as ate_30,
  count(*) filter (where a.tempo_ate_humano_s is not null)::int as com_tempo,
  round(avg(a.tempo_ate_humano_s))::int as tempo_ate_humano,
  round(avg(a.tempo_primeira_resposta_s))::int as tempo_primeira_resposta,
  round(avg(a.tempo_medio_resposta_s))::int as tempo_medio_resposta,
  max(a.tempo_max_resposta_s)::int as tempo_max_resposta,
  coalesce(sum(a.esperas_acima_30), 0)::int as esperas_30,
  coalesce(sum(a.respostas_medidas), 0)::int as respostas,
  coalesce(sum(a.sem_resposta), 0)::int as sem_resposta,
  coalesce(sum(a.transferencias), 0)::int as transferencias,
  count(*) filter (where a.lead_novo)::int as leads_novos,
  count(*) filter (where a.fora_horario)::int as fora_horario,
  round(avg(a.duracao_s) filter (where a.precisou_humano))::int as duracao
`);

type Linha = Record<string, any>;
const camel = (r: Linha) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()), v]));

async function agrupar(onde: SQL, chave: string, rotulo: string, extras = "", juntar = "", rotuloAgregado = false) {
  const r = await db.execute(sql`
    select ${sql.raw(chave)} as chave, ${sql.raw(rotulo)} as rotulo ${sql.raw(extras)}, ${METRICAS}
    from atendimentos a ${sql.raw(juntar)}
    where ${onde}
    group by 1 ${sql.raw(rotuloAgregado ? "" : extras ? ", 2, 3" : ", 2")}
    order by total desc
    limit 60`);
  return [...r].map(camel);
}

/** Todas as métricas do painel para um filtro (usado pela tela e pelo assistente de IA) */
export async function calcularPainel(empresaId: string, query: FiltroAtendimentos) {
    // As condições usam a tabela "atendimentos"; nas consultas abaixo ela tem o apelido "a"
    const onde = sql`a.id in (select id from atendimentos where ${and(...condicoesAtendimentos(empresaId, query))})`;
    const tz = env.TZ_RELATORIOS.replace(/'/g, "");

    const [resumo] = [...(await db.execute(sql`select ${METRICAS} from atendimentos a where ${onde}`))].map(camel);
    const [porChatbot, porDepartamento, porCidade, porCanal, porFonte, porOrigem, porAnuncio, porAtendente, porTime] = await Promise.all([
      agrupar(onde, "a.chatbot_id", "c.nome", ", c.cor", "join chatbots c on c.id = a.chatbot_id"),
      agrupar(onde, "a.departamento_id", "coalesce(d.nome, 'Sem departamento')", ", d.cor", "left join departamentos d on d.id = a.departamento_id"),
      agrupar(onde, "lower(coalesce(a.cidade, ''))", "coalesce(initcap(min(a.cidade)), 'Não informada')", "", "", true),
      agrupar(onde, "lower(coalesce(a.canal, ''))", "coalesce(min(a.canal), 'Não informado')", "", "", true),
      agrupar(onde, "lower(coalesce(a.fonte, ''))", "coalesce(min(a.fonte), 'Não informada')", "", "", true),
      agrupar(onde, "a.origem_id", "coalesce(o.nome, 'Sem origem')", ", o.cor", "left join origens o on o.id = a.origem_id"),
      agrupar(onde, "lower(coalesce(a.anuncio_plataforma, ''))", "coalesce(min(a.anuncio_plataforma), 'Sem anúncio')", "", "", true),
      agrupar(onde, "a.atendente_id", "coalesce(t.nome, 'Sem atendente')", ", tm.nome as time_nome", "left join atendentes t on t.id = a.atendente_id left join times tm on tm.id = t.time_id"),
      agrupar(onde, "t.time_id", "coalesce(tm.nome, 'Sem time')", ", tm.cor", "left join atendentes t on t.id = a.atendente_id left join times tm on tm.id = t.time_id"),
    ]);

    // Transferências por atendente: quem passou adiante (feitas) e quem recebeu
    const transferencias = [
      ...(await db.execute(sql`
        select x.atendente_id as chave, t.nome as rotulo,
          count(*) filter (where exists (select 1 from atendimento_atendentes y where y.atendimento_id = x.atendimento_id and y.ordem = x.ordem + 1))::int as feitas,
          count(*) filter (where x.ordem > 0)::int as recebidas,
          count(*)::int as participou
        from atendimento_atendentes x
        join atendentes t on t.id = x.atendente_id
        join atendimentos a on a.id = x.atendimento_id
        where ${onde}
        group by 1, 2
        having count(*) filter (where x.ordem > 0) > 0
            or count(*) filter (where exists (select 1 from atendimento_atendentes y where y.atendimento_id = x.atendimento_id and y.ordem = x.ordem + 1)) > 0
        order by feitas desc
        limit 30`)),
    ].map(camel);

    const serie = [
      ...(await db.execute(sql`
        select to_char(a.inicio_em at time zone ${tz}, 'YYYY-MM-DD') as dia, a.chatbot_id as chatbot_id,
          count(*)::int as total, count(*) filter (where a.precisou_humano)::int as humano, count(*) filter (where a.sem_humano)::int as sem_humano,
          count(*) filter (where a.atendido_ate_30)::int as ate_30,
          count(*) filter (where a.tempo_ate_humano_s is not null)::int as com_tempo,
          coalesce(sum(a.tempo_ate_humano_s), 0)::bigint::float8 as soma_tempo,
          count(*) filter (where a.lead_novo)::int as leads_novos
        from atendimentos a where ${onde}
        group by 1, 2 order by 1`)),
    ].map(camel);

    // Quando os clientes chegam: dia da semana × hora (1ª mensagem do cliente)
    const horarios = [
      ...(await db.execute(sql`
        select extract(dow from a.primeira_msg_cliente_em at time zone ${tz})::int as dia_semana,
               extract(hour from a.primeira_msg_cliente_em at time zone ${tz})::int as hora,
               count(*)::int as total
        from atendimentos a where ${onde} and a.primeira_msg_cliente_em is not null
        group by 1, 2`)),
    ].map(camel);

    // Distribuição dos tempos em faixas (quantos atendimentos caem em cada faixa)
    const FAIXAS = `case
        when {c} < 300 then 0 when {c} < 900 then 1 when {c} < 1800 then 2
        when {c} < 3600 then 3 when {c} < 7200 then 4 else 5 end`;
    const faixa = async (coluna: string) =>
      [
        ...(await db.execute(sql`
          select ${sql.raw(FAIXAS.replaceAll("{c}", coluna))}::int as faixa, count(*)::int as total
          from atendimentos a where ${onde} and ${sql.raw(coluna)} is not null
          group by 1 order by 1`)),
      ].map(camel);
    const [faixasAteHumano, faixasResposta] = await Promise.all([faixa("a.tempo_ate_humano_s"), faixa("a.tempo_medio_resposta_s")]);

    // Quem manda as mensagens nas conversas
    const [mensagens] = [
      ...(await db.execute(sql`
        select coalesce(sum(a.msgs_cliente), 0)::int as cliente, coalesce(sum(a.msgs_bot), 0)::int as bot,
               coalesce(sum(a.msgs_humano), 0)::int as humano, coalesce(sum(a.msgs_api), 0)::int as api
        from atendimentos a where ${onde}`)),
    ].map(camel);

    const [porInteresse, porEtiqueta] = await Promise.all([
      agrupar(onde, "lower(coalesce(a.interesse, ''))", "coalesce(initcap(min(a.interesse)), 'Não identificado')", "", "", true),
      db
        .execute(sql`
          select e.id as chave, e.nome as rotulo, e.cor, count(*)::int as total
          from atendimento_etiquetas x join etiquetas e on e.id = x.etiqueta_id join atendimentos a on a.id = x.atendimento_id
          where ${onde} group by 1, 2, 3 order by total desc limit 20`)
        .then((r) => [...r].map(camel)),
    ]);

    return { resumo, porChatbot, porDepartamento, porCidade, porCanal, porFonte, porOrigem, porAnuncio, porAtendente, porTime, transferencias, serie, horarios, faixasAteHumano, faixasResposta, mensagens, porInteresse, porEtiqueta };
}

export const rotasDashboard = new Elysia({ prefix: "/api" })
  .use(protegido({ empresa: true }))
  .get("/painel", ({ query, empresaId }) => calcularPainel(empresaId, query as FiltroAtendimentos))
  /** Situação geral (avisos no topo e atualização automática das telas) */
  .get("/status", async ({ empresaId }) => {
    const [fila] = (await db
      .select({
        pendentes: sql<number>`count(*) filter (where ${atendimentos.classificacaoStatus} in ('pendente','processando'))::int`,
        erros: sql<number>`count(*) filter (where ${atendimentos.classificacaoStatus} = 'erro')::int`,
        ultimaAlteracao: sql<string | null>`max(${atendimentos.atualizadoEm})::text`,
      })
      .from(atendimentos)
      .where(eq(atendimentos.empresaId, empresaId))) as [{ pendentes: number; erros: number; ultimaAlteracao: string | null }];
    const [ultimoEvento] = await db
      .select({ recebidoEm: webhookEventos.recebidoEm, status: webhookEventos.status })
      .from(webhookEventos)
      .where(eq(webhookEventos.empresaId, empresaId))
      .orderBy(desc(webhookEventos.recebidoEm))
      .limit(1);
    return { agenteAtivo: agenteAtivo(), modelo: agenteAtivo() ? env.OPENAI_MODEL : null, fusoHorario: env.TZ_RELATORIOS, ...fila, ultimoEvento: ultimoEvento ?? null };
  });
