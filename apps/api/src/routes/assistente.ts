/**
 * Assistente de IA do painel (balão flutuante). Responde perguntas sobre os dados da empresa
 * com texto e, quando fizer sentido, um gráfico. Consulta o banco só por funções prontas
 * (nunca SQL livre) e só enxerga a empresa do usuário.
 */
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { db } from "../db/client";
import { atendentes, atendimentos, chatbots, contatos, departamentos, etiquetasPlataforma, origens, times } from "../db/schema";
import { env } from "../env";
import { protegido } from "../lib/auth";
import { condicoesAtendimentos, type FiltroAtendimentos } from "../lib/filtros";
import { agenteAtivo } from "../services/organizador";
import { calcularPainel } from "./dashboard";

let cliente: OpenAI | null = null;
const openai = () => (cliente ??= new OpenAI({ apiKey: env.OPENAI_API_KEY }));

const FILTROS_PARAMS = {
  inicio: { type: "string", description: "Data inicial YYYY-MM-DD (inclusive)" },
  fim: { type: "string", description: "Data final YYYY-MM-DD (inclusive)" },
  chatbot: { type: "string", description: "Nome do chatbot/loja" },
  atendente: { type: "string", description: "Nome do atendente" },
  time: { type: "string", description: "Nome do time" },
  departamento: { type: "string", description: "Nome do departamento" },
  origem: { type: "string", description: "Nome da origem" },
  canal: { type: "string", description: "Canal (WhatsApp, Instagram...)" },
  cidade: { type: "string", description: "Cidade" },
  fonte: { type: "string", description: "Fonte do contato (Ads, Inbound Message...)" },
  etiqueta_plataforma: {
    type: "string",
    description: "Nome de uma etiqueta que o contato tinha na plataforma naquele atendimento (ex.: Grow = veio pelo Grow). Grow NÃO é origem: use este filtro.",
  },
} as const;

const FERRAMENTAS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_metricas",
      description:
        "Métricas agregadas de atendimento para um período/filtro: totais, tempos médios (em minutos úteis), % atendidos por humano em até 30 min, " +
        "sem atendimento humano, esperas acima de 30 min, transferências, leads novos — e as mesmas métricas por chatbot, departamento, cidade, " +
        "canal, fonte, origem, plataforma de anúncio, atendente e time, mais transferências feitas/recebidas por atendente e volume por dia.",
      parameters: { type: "object", properties: FILTROS_PARAMS, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_atendimentos",
      description: "Lista atendimentos individuais (cliente, atendente, data, tempos) para responder 'quais/quem'.",
      parameters: {
        type: "object",
        properties: {
          ...FILTROS_PARAMS,
          criterio: {
            type: "string",
            enum: ["recentes", "sem_humano", "esperas_acima_30", "mais_demorados", "com_transferencia"],
            description: "Que atendimentos trazer",
          },
          limite: { type: "number", description: "Até 30" },
        },
        additionalProperties: false,
      },
    },
  },
];

type Filtros = Partial<Record<keyof typeof FILTROS_PARAMS, string>>;

/** Nomes → ids (busca sem diferença de maiúsculas) dentro da empresa */
async function resolverFiltros(empresaId: string, f: Filtros): Promise<FiltroAtendimentos> {
  const achar = async (tab: typeof chatbots | typeof atendentes | typeof departamentos | typeof origens | typeof times | typeof etiquetasPlataforma, nome?: string) => {
    if (!nome) return undefined;
    const [x] = await db
      .select({ id: tab.id })
      .from(tab)
      .where(and(eq(tab.empresaId, empresaId), ilike(tab.nome, `%${nome.replace(/[%_]/g, "")}%`)))
      .limit(1);
    return x?.id ?? "00000000-0000-0000-0000-000000000000";
  };
  return {
    inicio: f.inicio,
    fim: f.fim,
    chatbot_id: await achar(chatbots, f.chatbot),
    atendente_id: await achar(atendentes, f.atendente),
    time_id: await achar(times, f.time),
    departamento_id: await achar(departamentos, f.departamento),
    origem_id: await achar(origens, f.origem),
    etiqueta_plataforma: await achar(etiquetasPlataforma, f.etiqueta_plataforma),
    canal: f.canal,
    cidade: f.cidade,
    fonte: f.fonte,
  };
}

const min = (s: number | null | undefined) => (s === null || s === undefined ? null : Math.round((s / 60) * 10) / 10);

/** Deixa o resultado do painel enxuto para o modelo (tempos em minutos) */
function enxugar(linhas: any[], limite = 15) {
  return linhas.slice(0, limite).map((l) => ({
    nome: l.rotulo,
    ...(l.timeNome && { time: l.timeNome }),
    atendimentos: l.total,
    foram_para_humano: l.humano,
    sem_atendimento_humano: l.semHumano,
    humano_ate_30min: l.ate30,
    pct_ate_30min: l.comTempo ? Math.round((l.ate30 / l.comTempo) * 100) : null,
    min_robo_ate_humano: min(l.tempoAteHumano),
    min_primeira_resposta: min(l.tempoPrimeiraResposta),
    min_resposta_media: min(l.tempoMedioResposta),
    esperas_acima_30min: l.esperas30,
    mensagens_sem_resposta: l.semResposta,
    transferencias: l.transferencias,
    leads_novos: l.leadsNovos,
  }));
}

async function executar(empresaId: string, nome: string, args: any): Promise<unknown> {
  const filtros = await resolverFiltros(empresaId, args ?? {});
  if (nome === "consultar_metricas") {
    const p = await calcularPainel(empresaId, filtros);
    return {
      resumo: enxugar([{ ...p.resumo, rotulo: "Total" }])[0],
      por_chatbot: enxugar(p.porChatbot),
      por_departamento: enxugar(p.porDepartamento),
      por_cidade: enxugar(p.porCidade),
      por_canal: enxugar(p.porCanal),
      por_fonte: enxugar(p.porFonte),
      por_origem: enxugar(p.porOrigem),
      por_plataforma_anuncio: enxugar(p.porAnuncio),
      por_atendente: enxugar(p.porAtendente, 40),
      por_time: enxugar(p.porTime),
      transferencias_por_atendente: p.transferencias.map((x: any) => ({ nome: x.rotulo, transferiu: x.feitas, recebeu: x.recebidas })),
      por_dia: Object.entries(
        p.serie.reduce((acc: Record<string, number>, s: any) => ((acc[s.dia] = (acc[s.dia] ?? 0) + s.total), acc), {}),
      ).map(([dia, total]) => ({ dia, total })),
    };
  }
  if (nome === "listar_atendimentos") {
    const ordem = {
      recentes: desc(atendimentos.inicioEm),
      sem_humano: desc(atendimentos.inicioEm),
      esperas_acima_30: desc(atendimentos.esperasAcima30),
      mais_demorados: sql`${atendimentos.tempoAteHumanoS} desc nulls last`,
      com_transferencia: desc(atendimentos.transferencias),
    }[args?.criterio as string] ?? desc(atendimentos.inicioEm);
    const extra = {
      sem_humano: sql`${atendimentos.semHumano}`,
      esperas_acima_30: sql`${atendimentos.esperasAcima30} > 0`,
      com_transferencia: sql`${atendimentos.transferencias} > 0`,
      mais_demorados: sql`${atendimentos.tempoAteHumanoS} is not null`,
    }[args?.criterio as string];
    const linhas = await db
      .select({
        cliente: contatos.nome,
        chatbot: chatbots.nome,
        atendente: atendentes.nome,
        inicio: atendimentos.inicioEm,
        robo_ate_humano_s: atendimentos.tempoAteHumanoS,
        resposta_media_s: atendimentos.tempoMedioRespostaS,
        esperas_acima_30: atendimentos.esperasAcima30,
        transferencias: atendimentos.transferencias,
        sem_humano: atendimentos.semHumano,
        resumo: atendimentos.resumo,
      })
      .from(atendimentos)
      .innerJoin(contatos, eq(contatos.id, atendimentos.contatoId))
      .innerJoin(chatbots, eq(chatbots.id, atendimentos.chatbotId))
      .leftJoin(atendentes, eq(atendentes.id, atendimentos.atendenteId))
      .where(and(...condicoesAtendimentos(empresaId, filtros), extra))
      .orderBy(ordem)
      .limit(Math.min(30, Math.max(1, Number(args?.limite) || 10)));
    return linhas.map((l) => ({ ...l, robo_ate_humano_s: undefined, resposta_media_s: undefined, min_robo_ate_humano: min(l.robo_ate_humano_s), min_resposta_media: min(l.resposta_media_s) }));
  }
  return { erro: "função desconhecida" };
}

const RESPOSTA_FINAL = {
  type: "json_schema" as const,
  json_schema: {
    name: "resposta_assistente",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["texto", "grafico"],
      properties: {
        texto: { type: "string", description: "Resposta em português, curta e direta. Pode usar **negrito** e listas com '- '." },
        grafico: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              required: ["tipo", "titulo", "unidade", "dados"],
              properties: {
                tipo: { type: "string", enum: ["barras", "linha", "pizza"] },
                titulo: { type: "string" },
                unidade: { type: "string", description: "ex.: atendimentos, minutos, %" },
                dados: {
                  type: "array",
                  items: { type: "object", additionalProperties: false, required: ["rotulo", "valor"], properties: { rotulo: { type: "string" }, valor: { type: "number" } } },
                },
              },
            },
          ],
        },
      },
    },
  },
};

export const rotasAssistente = new Elysia({ prefix: "/api/assistente" })
  .use(protegido({ empresa: true }))
  .post(
    "/",
    async ({ body, empresaId, set }) => {
      if (!agenteAtivo()) {
        set.status = 503;
        return { erro: "O assistente precisa da chave da OpenAI configurada." };
      }
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: env.TZ_RELATORIOS }).format(new Date());
      const nomes = async (tab: typeof chatbots | typeof atendentes | typeof departamentos | typeof origens | typeof times) =>
        (await db.select({ nome: tab.nome }).from(tab).where(eq(tab.empresaId, empresaId)).orderBy(asc(tab.nome)).limit(120)).map((x) => x.nome).join(", ");
      const sistema = `Você é o assistente do painel de atendimento de uma empresa. Responda perguntas do gestor sobre os atendimentos
usando SOMENTE os dados das funções. Hoje é ${hoje} (fuso ${env.TZ_RELATORIOS}). Sem período informado, use os últimos 30 dias e diga isso.
Tempos são em minutos úteis (só o horário de atendimento). "Robô até humano" = da transferência do robô até a 1ª resposta humana.
Seja direto: comece pela resposta, depois 1 a 3 detalhes. Quando houver ranking ou comparação, devolva um gráfico (barras para ranking,
linha para evolução no tempo, pizza para participação com poucos itens). Se a pergunta não for sobre os dados, explique gentilmente o que você sabe responder.
Nunca invente números.
Chatbots: ${await nomes(chatbots)}
Atendentes: ${await nomes(atendentes)}
Times: ${(await nomes(times)) || "(nenhum)"}
Departamentos: ${await nomes(departamentos)}
Origens: ${await nomes(origens)}`;

      const mensagens: ChatCompletionMessageParam[] = [
        { role: "system", content: sistema },
        ...body.historico.slice(-10).map((m) => ({ role: m.papel === "usuario" ? ("user" as const) : ("assistant" as const), content: m.texto.slice(0, 4000) })),
        { role: "user", content: body.pergunta.slice(0, 2000) },
      ];

      for (let passo = 0; passo < 5; passo++) {
        const r = await openai().chat.completions.create({
          model: env.OPENAI_MODEL,
          temperature: 0.2,
          messages: mensagens,
          tools: FERRAMENTAS,
          response_format: RESPOSTA_FINAL,
        });
        const msg = r.choices[0]?.message;
        if (!msg) break;
        if (msg.tool_calls?.length) {
          mensagens.push(msg);
          for (const chamada of msg.tool_calls) {
            if (chamada.type !== "function") continue;
            let args: unknown = {};
            try {
              args = JSON.parse(chamada.function.arguments || "{}");
            } catch {}
            const resultado = await executar(empresaId, chamada.function.name, args).catch((e) => ({ erro: String(e?.message ?? e) }));
            mensagens.push({ role: "tool", tool_call_id: chamada.id, content: JSON.stringify(resultado).slice(0, 60_000) });
          }
          continue;
        }
        try {
          return JSON.parse(msg.content ?? "");
        } catch {
          return { texto: msg.content ?? "Não consegui responder agora.", grafico: null };
        }
      }
      return { texto: "Não consegui concluir a consulta. Tente perguntar de outro jeito.", grafico: null };
    },
    {
      body: t.Object({
        pergunta: t.String({ minLength: 1, maxLength: 2000 }),
        historico: t.Array(t.Object({ papel: t.Union([t.Literal("usuario"), t.Literal("assistente")]), texto: t.String() }), { maxItems: 30 }),
      }),
    },
  );
