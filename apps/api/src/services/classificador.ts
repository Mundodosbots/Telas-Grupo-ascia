import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import OpenAI from "openai";
import { db } from "../db/client";
import {
  atendimentoEtiquetas,
  atendimentos,
  atribuicoes,
  clientes,
  empresas,
  etiquetas,
  origens,
  vendedores,
} from "../db/schema";
import { env } from "../env";

const NENHUMA = "NENHUMA";

let cliente: OpenAI | null = null;
function openai(): OpenAI {
  if (!cliente) cliente = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cliente;
}

export const agenteAtivo = () => Boolean(env.OPENAI_API_KEY);

type RespostaAgente = {
  origem: string;
  etiquetas: string[];
  confianca: number;
  justificativa: string;
  sugestao_nova_origem: string | null;
};

const INSTRUCOES = `Você classifica atendimentos de concessionárias de veículos do Grupo Asia.
Recebe o resumo de uma conversa de WhatsApp entre um cliente e o chatbot, que foi atribuída a um vendedor.

Sua tarefa:
1. ORIGEM: escolha exatamente UMA origem da lista, ou seja, de onde/como o cliente chegou até a loja.
   - Use o código (ex.: "O3"). Baseie-se em evidências do texto (menções a anúncio, Instagram, Google, campanha, indicação, RPA, etc.).
   - O campo "fonte informada pelo bot", quando existir, é uma pista forte.
   - Origens marcadas [EXCLUSIVA DESTA EMPRESA] são mais específicas: quando se encaixarem, prefira-as às genéricas.
   - Se nenhuma origem da lista se encaixar ou o texto não der pistas, responda "${NENHUMA}".
2. ETIQUETAS: escolha zero ou mais etiquetas da lista que descrevam o atendimento (interesse, perfil, situação). Só use etiquetas com evidência no texto.
3. CONFIANÇA: número de 0 a 1 sobre a ORIGEM escolhida. Use menos de 0.6 quando estiver deduzindo sem evidência clara.
4. JUSTIFICATIVA: uma frase curta em português citando a evidência.
5. SUGESTÃO: se respondeu "${NENHUMA}" mas o texto indica uma origem concreta que não está na lista, sugira um nome curto para uma nova origem (ex.: "Feirão de sábado"). Caso contrário, null.

Nunca invente códigos fora das listas.`;

export async function classificarAtendimento(atendimentoId: string): Promise<void> {
  const [a] = await db
    .select({
      id: atendimentos.id,
      empresaId: atendimentos.empresaId,
      empresaNome: empresas.nome,
      resumo: atendimentos.resumo,
      fonte: atendimentos.fonteInformada,
      clienteNome: clientes.nome,
      vendedorNome: vendedores.nome,
    })
    .from(atendimentos)
    .innerJoin(empresas, eq(empresas.id, atendimentos.empresaId))
    .innerJoin(clientes, eq(clientes.id, atendimentos.clienteId))
    .innerJoin(vendedores, eq(vendedores.id, atendimentos.vendedorAtualId))
    .where(eq(atendimentos.id, atendimentoId));
  if (!a) return;

  // Resumos anteriores ajudam quando o último é curto ("repassado para fulano")
  const historico = await db
    .select({ resumo: atribuicoes.resumo, fonte: atribuicoes.fonte, em: atribuicoes.atribuidoEm, vendedor: vendedores.nome })
    .from(atribuicoes)
    .innerJoin(vendedores, eq(vendedores.id, atribuicoes.vendedorId))
    .where(eq(atribuicoes.atendimentoId, atendimentoId))
    .orderBy(asc(atribuicoes.atribuidoEm));

  const daEmpresa = (col: AnyPgColumn) => or(isNull(col), eq(col, a.empresaId));
  const listaOrigens = await db
    .select({ id: origens.id, nome: origens.nome, descricao: origens.descricao, empresaId: origens.empresaId })
    .from(origens)
    .where(and(eq(origens.ativo, true), daEmpresa(origens.empresaId)))
    .orderBy(asc(origens.nome));
  const listaEtiquetas = await db
    .select({ id: etiquetas.id, nome: etiquetas.nome, descricao: etiquetas.descricao })
    .from(etiquetas)
    .where(and(eq(etiquetas.ativo, true), daEmpresa(etiquetas.empresaId)))
    .orderBy(asc(etiquetas.nome));

  const codOrigem = new Map(listaOrigens.map((o, i) => [`O${i + 1}`, o.id]));
  const codEtiqueta = new Map(listaEtiquetas.map((e, i) => [`E${i + 1}`, e.id]));

  const textoHistorico = historico
    .map((h, i) => `#${i + 1} (${h.em.toISOString()}) → ${h.vendedor}${h.fonte ? ` | fonte: ${h.fonte}` : ""}\n${h.resumo || "(sem resumo)"}`)
    .join("\n\n");

  const entrada = `EMPRESA: ${a.empresaNome}
CLIENTE: ${a.clienteNome}
VENDEDOR ATUAL: ${a.vendedorNome}
FONTE INFORMADA PELO BOT: ${a.fonte ?? "(não informada)"}

RESUMO MAIS RECENTE:
${a.resumo || "(vazio)"}

HISTÓRICO DE ATRIBUIÇÕES:
${textoHistorico || "(nenhum)"}

ORIGENS DISPONÍVEIS:
${listaOrigens.map((o, i) => `O${i + 1} — ${o.nome}${o.empresaId ? " [EXCLUSIVA DESTA EMPRESA]" : ""}: ${o.descricao}`).join("\n") || "(nenhuma cadastrada)"}

ETIQUETAS DISPONÍVEIS:
${listaEtiquetas.map((e, i) => `E${i + 1} — ${e.nome}: ${e.descricao}`).join("\n") || "(nenhuma cadastrada)"}`;

  const resposta = await openai().chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: INSTRUCOES },
      { role: "user", content: entrada },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "classificacao_atendimento",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["origem", "etiquetas", "confianca", "justificativa", "sugestao_nova_origem"],
          properties: {
            origem: { type: "string", enum: [...codOrigem.keys(), NENHUMA] },
            etiquetas: {
              type: "array",
              items: codEtiqueta.size ? { type: "string", enum: [...codEtiqueta.keys()] } : { type: "string" },
            },
            confianca: { type: "number" },
            justificativa: { type: "string" },
            sugestao_nova_origem: { type: ["string", "null"] },
          },
        },
      },
    },
  });

  const conteudo = resposta.choices[0]?.message?.content;
  if (!conteudo) throw new Error("Resposta vazia do modelo");
  const r = JSON.parse(conteudo) as RespostaAgente;

  const origemId = r.origem === NENHUMA ? null : (codOrigem.get(r.origem) ?? null);
  const etiquetaIds = [...new Set(r.etiquetas.map((c) => codEtiqueta.get(c)).filter((x): x is string => !!x))];
  const confianca = Math.max(0, Math.min(1, Number(r.confianca) || 0));
  const status = origemId && confianca >= env.AGENTE_CONFIANCA_MINIMA ? "classificado" : "revisar";

  await db.transaction(async (tx) => {
    // Só grava se ninguém mexeu enquanto o agente pensava (humano classificou ou chegou atribuição nova)
    const atualizados = await tx
      .update(atendimentos)
      .set({
        origemId,
        classificacaoStatus: status,
        classificacaoConfianca: confianca,
        classificacaoJustificativa: r.justificativa,
        classificacaoSugestao: origemId ? null : r.sugestao_nova_origem,
        classificacaoErro: null,
        classificadoEm: new Date(),
        classificadoPorUsuarioId: null,
        atualizadoEm: new Date(),
      })
      .where(and(eq(atendimentos.id, atendimentoId), eq(atendimentos.classificacaoStatus, "processando")))
      .returning({ id: atendimentos.id });
    if (!atualizados.length) return;

    await tx.delete(atendimentoEtiquetas).where(eq(atendimentoEtiquetas.atendimentoId, atendimentoId));
    if (etiquetaIds.length) {
      await tx.insert(atendimentoEtiquetas).values(etiquetaIds.map((etiquetaId) => ({ atendimentoId, etiquetaId })));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Fila: atendimentos "pendente" são processados em segundo plano.     */
/* A fila mora no próprio banco, então sobrevive a reinícios.          */
/* ------------------------------------------------------------------ */

const MAX_TENTATIVAS = 3;
const ESPERA_APOS_FALHA_S = 30;
const LOTE = 4;
let ocupado = false;
let intervalo: ReturnType<typeof setInterval> | null = null;

async function pegarLote(): Promise<string[]> {
  const linhas = await db.execute<{ id: string }>(sql`
    update atendimentos set classificacao_status = 'processando', atualizado_em = now()
    where id in (
      select id from atendimentos
      where classificacao_status = 'pendente'
        -- quem falhou espera um pouco antes de tentar de novo, sem travar os outros
        and (classificacao_tentativas = 0 or atualizado_em < now() - make_interval(secs => ${ESPERA_APOS_FALHA_S}))
      order by ultima_atribuicao_em
      limit ${LOTE}
      for update skip locked
    )
    returning id`);
  return [...linhas].map((l) => l.id);
}

async function processar(id: string): Promise<boolean> {
  try {
    await classificarAtendimento(id);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Agente falhou no atendimento ${id}:`, msg);
    await db
      .update(atendimentos)
      .set({
        classificacaoTentativas: sql`${atendimentos.classificacaoTentativas} + 1`,
        classificacaoErro: msg.slice(0, 500),
        atualizadoEm: new Date(),
        classificacaoStatus: sql`case when ${atendimentos.classificacaoTentativas} + 1 >= ${MAX_TENTATIVAS} then 'erro' else 'pendente' end::status_classificacao`,
      })
      .where(and(eq(atendimentos.id, id), eq(atendimentos.classificacaoStatus, "processando")));
    return false;
  }
}

async function ciclo() {
  if (ocupado || !agenteAtivo()) return;
  ocupado = true;
  try {
    for (;;) {
      const ids = await pegarLote();
      if (!ids.length) break;
      await Promise.all(ids.map(processar));
    }
  } catch (e) {
    console.error("Erro no ciclo do agente:", e);
  } finally {
    ocupado = false;
  }
}

export async function iniciarAgente() {
  // Se o servidor caiu no meio de uma classificação, devolve para a fila
  await db
    .update(atendimentos)
    .set({ classificacaoStatus: "pendente" })
    .where(eq(atendimentos.classificacaoStatus, "processando"));

  if (!agenteAtivo()) {
    console.warn("OPENAI_API_KEY não definida: agente desligado. Atendimentos ficam pendentes para classificação manual.");
    return;
  }
  console.log(`Agente de classificação ligado (modelo ${env.OPENAI_MODEL}).`);
  intervalo = setInterval(ciclo, 10_000);
  void ciclo();
}

export function acordarAgente() {
  if (agenteAtivo()) setTimeout(ciclo, 50);
}

export function pararAgente() {
  if (intervalo) clearInterval(intervalo);
}

export async function reenfileirar(ids: string[]) {
  if (!ids.length) return;
  await db
    .update(atendimentos)
    .set({ classificacaoStatus: "pendente", classificacaoTentativas: 0, classificacaoErro: null, atualizadoEm: new Date() })
    .where(inArray(atendimentos.id, ids));
  acordarAgente();
}
