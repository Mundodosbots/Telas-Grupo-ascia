/**
 * Agente organizador: recebe tudo o que chegou de um atendimento (campos, anúncio, etiquetas, conversa)
 * e devolve origem, departamento, cidade, interesse, etiquetas e um resumo curto.
 * Fila no próprio banco (status "pendente"), processada em segundo plano.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import OpenAI from "openai";
import { db } from "../db/client";
import { atendentes, atendimentoEtiquetas, atendimentos, chatbots, contatos, departamentos, etiquetas, mensagens, origens } from "../db/schema";
import { env } from "../env";
import { contato as fmtContato, registrar } from "../lib/log";

const NENHUM = "NENHUM";
export const ORIGEM_SEM_EVIDENCIA = "Contato direto / orgânico";
const MAX_MSGS = 160;
const MAX_CHARS_MSG = 700;

let cliente: OpenAI | null = null;
const openai = () => (cliente ??= new OpenAI({ apiKey: env.OPENAI_API_KEY }));
export const agenteAtivo = () => Boolean(env.OPENAI_API_KEY);

const INSTRUCOES = `Você organiza atendimentos de WhatsApp de concessionárias e lojas.
Recebe os dados de UM atendimento: campos do contato, dados de anúncio, etiquetas da plataforma e a conversa
(Cliente, Robô, API = mensagem automática de integração, e o atendente humano pelo nome).

Devolva:
1. ORIGEM — de onde/como o cliente chegou. Escolha UM código da lista de origens.
   - Anúncio: campos ADS (texto, link, plataforma, CTWA), "Fonte do contato" = Ads, "vi o anúncio", evento ADS_CLICKED.
     Use a origem da plataforma certa (Instagram/Facebook) quando ADS Plataforma ou o link indicar.
   - Os dados de anúncio e as etiquetas ACUMULAM o histórico do contato. Se a conversa mostra que ESTE atendimento
     começou por outro motivo (ex.: cliente antigo voltou para revisão), dê mais peso à conversa.
   - "Campanha de marketing" é para resposta a disparo em massa, promoção, convite de evento — nunca para anúncio pago clicado.
   - Sem nenhuma pista, responda "${NENHUM}".
2. DEPARTAMENTO — o assunto/setor que o cliente procura (código da lista) ou "${NENHUM}".
3. ETIQUETAS — zero ou mais códigos da lista, só com evidência na conversa.
4. CIDADE — cidade do cliente ou da loja que ele quer, se aparecer (ex.: respondeu "Sinop" ao menu). Senão null.
5. INTERESSE — em até 8 palavras (ex.: "Fastback Impetus 0 km à vista"). Senão null.
6. RESUMO — 1 a 3 frases objetivas: o que o cliente queria, o que aconteceu e como terminou.
7. CONFIANÇA (0 a 1) sobre a ORIGEM, e JUSTIFICATIVA curta citando a evidência.
Nunca invente códigos fora das listas. Responda em português.`;

type Resposta = {
  origem: string;
  departamento: string;
  etiquetas: string[];
  cidade: string | null;
  interesse: string | null;
  resumo: string;
  confianca: number;
  justificativa: string;
};

const fmtHora = (d: Date, fuso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

export async function organizarAtendimento(id: string): Promise<void> {
  const [a] = await db
    .select({ at: atendimentos, contato: contatos, chatbotNome: chatbots.nome, fuso: chatbots.fuso, atendenteNome: atendentes.nome })
    .from(atendimentos)
    .innerJoin(contatos, eq(contatos.id, atendimentos.contatoId))
    .innerJoin(chatbots, eq(chatbots.id, atendimentos.chatbotId))
    .leftJoin(atendentes, eq(atendentes.id, atendimentos.atendenteId))
    .where(eq(atendimentos.id, id));
  if (!a) return;
  const { at, contato } = a;
  const empresaId = at.empresaId;
  const ativos = <T extends { empresaId: string; ativo: boolean }>(tab: any) => and(eq(tab.empresaId, empresaId), eq(tab.ativo, true));
  const listaOrigens = await db.select().from(origens).where(ativos(origens)).orderBy(asc(origens.nome));
  const listaDeps = await db.select().from(departamentos).where(ativos(departamentos)).orderBy(asc(departamentos.nome));
  const listaEtqs = await db.select().from(etiquetas).where(ativos(etiquetas)).orderBy(asc(etiquetas.nome));
  const cod = <T extends { id: string }>(l: T[], p: string) => new Map(l.map((x, i) => [`${p}${i + 1}`, x.id]));
  const codO = cod(listaOrigens, "O");
  const codD = cod(listaDeps, "D");
  const codE = cod(listaEtqs, "E");

  const msgs = await db.select().from(mensagens).where(eq(mensagens.atendimentoId, id)).orderBy(asc(mensagens.enviadaEm), asc(mensagens.seq));
  const recorte = msgs.length > MAX_MSGS ? [...msgs.slice(0, 20), ...msgs.slice(-(MAX_MSGS - 20))] : msgs;
  const QUEM = { cliente: "Cliente", bot: "Robô", api: "API", humano: "" } as const;
  const conversa = recorte
    .map((m) => {
      const quem = m.remetenteTipo === "humano" ? `Atendente ${m.remetenteNome}` : QUEM[m.remetenteTipo];
      const t = m.texto.length > MAX_CHARS_MSG ? m.texto.slice(0, MAX_CHARS_MSG) + "…" : m.texto;
      return `[${fmtHora(m.enviadaEm, a.fuso)}] ${quem}: ${t}`;
    })
    .join("\n");
  const campos = Object.entries(contato.campos ?? {})
    .filter(([, v]) => v && v.length < 400)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n")
    .slice(0, 5000);
  const origemFixa = at.origemRegraId && at.origemId ? listaOrigens.find((o) => o.id === at.origemId) : undefined;

  const entrada = `CHATBOT: ${a.chatbotNome}
CONTATO: ${contato.nome}${contato.cidade ? ` (cidade cadastrada: ${contato.cidade})` : ""}${at.leadNovo ? " — lead NOVO" : " — contato já existia"}
ATENDENTE: ${a.atendenteNome ?? "(nenhum)"}
FONTE DO CONTATO: ${at.fonte ?? "(não informada)"} | CANAL: ${at.canal ?? "(não informado)"} | REF ENTRADA: ${at.refEntrada ?? "-"}
ANÚNCIO: ${at.anuncio ? JSON.stringify(at.anuncio) : "(nenhum)"}
ETIQUETAS DA PLATAFORMA: ${contato.etiquetas.join(", ") || "(nenhuma)"}
${origemFixa ? `\nORIGEM JÁ DEFINIDA POR REGRA: ${origemFixa.nome}. Use esse código e foque nos outros itens.\n` : ""}
OUTROS CAMPOS DO CONTATO:
${campos || "(nenhum)"}

CONVERSA DESTE ATENDIMENTO (${msgs.length} mensagens${msgs.length > recorte.length ? `, mostrando ${recorte.length}` : ""}):
${conversa || "(vazia)"}

ORIGENS:
${listaOrigens.map((o, i) => `O${i + 1} — ${o.nome}: ${o.descricao}`).join("\n")}

DEPARTAMENTOS:
${listaDeps.map((d, i) => `D${i + 1} — ${d.nome}: ${d.descricao}`).join("\n") || "(nenhum)"}

ETIQUETAS:
${listaEtqs.map((e, i) => `E${i + 1} — ${e.nome}: ${e.descricao}`).join("\n") || "(nenhuma)"}`;

  const enumOu = (m: Map<string, string>) => ({ type: "string", enum: [...m.keys(), NENHUM] });
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
        name: "organizacao_atendimento",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["origem", "departamento", "etiquetas", "cidade", "interesse", "resumo", "confianca", "justificativa"],
          properties: {
            origem: enumOu(codO),
            departamento: enumOu(codD),
            etiquetas: { type: "array", items: codE.size ? { type: "string", enum: [...codE.keys()] } : { type: "string" } },
            cidade: { type: ["string", "null"] },
            interesse: { type: ["string", "null"] },
            resumo: { type: "string" },
            confianca: { type: "number" },
            justificativa: { type: "string" },
          },
        },
      },
    },
  });
  const conteudo = resposta.choices[0]?.message?.content;
  if (!conteudo) throw new Error("Resposta vazia do modelo");
  const r = JSON.parse(conteudo) as Resposta;

  let origemId = codO.get(r.origem) ?? null;
  let confianca = Math.max(0, Math.min(1, Number(r.confianca) || 0));
  let justificativa = r.justificativa;
  let semEvidencia = false;
  if (origemFixa) {
    origemId = origemFixa.id;
    confianca = 1;
    justificativa = `${(at.classificacaoJustificativa ?? "").split(" | IA:")[0] || "Regra"} | IA: ${r.justificativa}`;
  } else if (!origemId) {
    const padrao = listaOrigens.find((o) => o.nome === ORIGEM_SEM_EVIDENCIA);
    if (padrao) {
      origemId = padrao.id;
      semEvidencia = true;
      justificativa = `Sem pista de origem: considerado ${ORIGEM_SEM_EVIDENCIA}. IA: ${r.justificativa}`;
    }
  }
  const etiquetaIds = [...new Set(r.etiquetas.map((c) => codE.get(c)).filter((x): x is string => !!x))];
  const departamentoId = codD.get(r.departamento) ?? null;

  let gravou = false as boolean;
  await db.transaction(async (tx) => {
    // Só grava se ninguém mexeu enquanto o agente pensava
    const ok = await tx
      .update(atendimentos)
      .set({
        origemId,
        departamentoId,
        cidade: r.cidade?.trim() || at.cidade || contato.cidade,
        interesse: r.interesse?.trim() || null,
        resumo: r.resumo.trim(),
        classificacaoStatus: "classificado",
        classificacaoConfianca: confianca,
        classificacaoJustificativa: justificativa,
        classificacaoErro: null,
        classificadoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(and(eq(atendimentos.id, id), eq(atendimentos.classificacaoStatus, "processando")))
      .returning({ id: atendimentos.id });
    if (!ok.length) return;
    await tx.delete(atendimentoEtiquetas).where(eq(atendimentoEtiquetas.atendimentoId, id));
    if (etiquetaIds.length) await tx.insert(atendimentoEtiquetas).values(etiquetaIds.map((etiquetaId) => ({ atendimentoId: id, etiquetaId })));
    gravou = true;
  });
  if (gravou) {
    const nome = (l: { id: string; nome: string }[], x: string | null) => l.find((o) => o.id === x)?.nome ?? "—";
    registrar(
      "IA",
      "Organizado",
      a.chatbotNome,
      contato.nome,
      fmtContato(contato.telefone),
      `origem: ${nome(listaOrigens, origemId)}${origemFixa ? " (regra)" : semEvidencia ? " (sem pista)" : ` (${Math.round(confianca * 100)}%)`}`,
      `departamento: ${nome(listaDeps, departamentoId)}`,
      r.cidade && `cidade: ${r.cidade}`,
    );
  }
}

/* ------------------------------ fila ------------------------------ */

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
        and (classificacao_tentativas = 0 or atualizado_em < now() - make_interval(secs => ${ESPERA_APOS_FALHA_S}))
      order by ultima_msg_em desc
      limit ${LOTE}
      for update skip locked
    )
    returning id`);
  return [...linhas].map((l) => l.id);
}

async function processar(id: string) {
  try {
    await organizarAtendimento(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    registrar("IA", "FALHOU", `atendimento ${id}`, msg);
    await db
      .update(atendimentos)
      .set({
        classificacaoTentativas: sql`${atendimentos.classificacaoTentativas} + 1`,
        classificacaoErro: msg.slice(0, 500),
        atualizadoEm: new Date(),
        classificacaoStatus: sql`case when ${atendimentos.classificacaoTentativas} + 1 >= ${MAX_TENTATIVAS} then 'erro' else 'pendente' end::status_classificacao`,
      })
      .where(and(eq(atendimentos.id, id), eq(atendimentos.classificacaoStatus, "processando")));
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
    console.error("Erro no ciclo do organizador:", e);
  } finally {
    ocupado = false;
  }
}

export async function iniciarOrganizador() {
  await db.update(atendimentos).set({ classificacaoStatus: "pendente" }).where(eq(atendimentos.classificacaoStatus, "processando"));
  if (!agenteAtivo()) {
    console.warn("OPENAI_API_KEY não definida: agente desligado. Os atendimentos entram, mas sem origem/departamento pela IA.");
    return;
  }
  console.log(`Agente organizador ligado (modelo ${env.OPENAI_MODEL}).`);
  intervalo = setInterval(ciclo, 10_000);
  void ciclo();
}

export const acordarOrganizador = () => {
  if (agenteAtivo()) setTimeout(ciclo, 50);
};
export const pararOrganizador = () => {
  if (intervalo) clearInterval(intervalo);
};

export async function reorganizar(ids: string[]) {
  if (!ids.length) return;
  await db
    .update(atendimentos)
    .set({ classificacaoStatus: "pendente", classificacaoTentativas: 0, classificacaoErro: null, atualizadoEm: new Date() })
    .where(inArray(atendimentos.id, ids));
  acordarOrganizador();
}
