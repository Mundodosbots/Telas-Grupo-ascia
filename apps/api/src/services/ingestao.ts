/**
 * Ingestão do envio da plataforma (fim do atendimento):
 *   contato completo + campos personalizados + histórico (200 e 50 mensagens)
 * → contato, atendentes, atendimentos (1 por protocolo) com tempos, mensagens, regras de origem.
 * Reenviar o mesmo contato só atualiza; nada duplica.
 */
import { and, eq, gt, inArray, lt, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  atendentes,
  atendimentoAtendentes,
  atendimentos,
  contatos,
  mensagens,
  webhookEventos,
  type Atendente,
  type Chatbot,
  type DadosAnuncio,
} from "../db/schema";
import { normalizarNome } from "../lib/util";
import {
  calcularTempos,
  ehEncerramento,
  juntarHistoricos,
  lerHistorico,
  localParaUtc,
  protocoloDaMensagem,
  separarAtendimentos,
  type Mensagem,
  type Sessao,
} from "./historico";
import { aplicarRegras } from "./regras";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Atendimentos mais antigos que isso entram pelo histórico, mas não vão para a IA (custo) */
const JANELA_IA_DIAS = 60;
const MAX_VALOR_CAMPO = 3000;
/** O envio sai poucos minutos depois do encerramento; mais que isso, o histórico está desatualizado */
const ATRASO_MAXIMO_MS = 60 * 60_000;

const fmtAviso = (d: Date, fuso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

/** "1795271914" (segundos), milissegundos ou data por extenso */
function lerMomento(v: string | undefined, fuso: string): Date | undefined {
  if (!v) return undefined;
  if (/^\d{10}$/.test(v)) return new Date(Number(v) * 1000);
  if (/^\d{13}$/.test(v)) return new Date(Number(v));
  return lerData(v, fuso, false);
}

/**
 * Histórico: "Historico 50" (as últimas mensagens, sempre com o atendimento que acabou) é a fonte principal;
 * "Historico Conversa" (o grande) completa o passado. O grande pode vir cortado pelo tamanho: se ele termina
 * antes de o de 50 começar, sobra um buraco no meio, e o que ficou de cada lado não pode ser juntado.
 */
function montarHistorico(mapa: Map<string, string>, fuso: string) {
  const ehRecente = (k: string) => /^historico\s*50$/.test(k);
  const recentes = lerHistorico([...mapa.entries()].find(([k]) => ehRecente(k))?.[1], fuso);
  const antigas = juntarHistoricos(...[...mapa.entries()].filter(([k]) => k.startsWith("historico") && !ehRecente(k)).map(([, v]) => lerHistorico(v, fuso)));
  if (!recentes.length || !antigas.length) return { msgs: juntarHistoricos(recentes, antigas), recentes, corte: null as Date | null, buraco: null as null | { de: Date; ate: Date } };
  const inicioRecentes = recentes[0]!.em;
  // No trecho que o de 50 cobre, vale o de 50 (a última mensagem do grande pode ter vindo cortada no meio)
  const doPassado = antigas.filter((m) => m.em < inicioRecentes);
  const fimAntigas = antigas.at(-1)!.em;
  const temBuraco = fimAntigas < inicioRecentes;
  return {
    msgs: juntarHistoricos(doPassado, recentes),
    recentes,
    corte: temBuraco ? inicioRecentes : null,
    buraco: temBuraco ? { de: fimAntigas, ate: inicioRecentes } : null,
  };
}

export class EnvioInvalido extends Error {}

/** Nome de atendente para comparar: sem acento, minúsculo e sem pontuação ("Mundo dos Bots ." = "mundo dos bots") */
export const nomeDeAtendente = (s: string) =>
  normalizarNome(s)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Lê os campos personalizados por nome (sem diferença de maiúsculas/acentos) */
function leitorCampos(p: Record<string, any>) {
  const mapa = new Map<string, string>();
  for (const c of Array.isArray(p.custom_fields) ? p.custom_fields : []) {
    if (!c || typeof c !== "object") continue;
    const nome = String(c.name ?? "").trim();
    const valor = c.value === null || c.value === undefined ? "" : String(c.value).trim();
    if (nome) mapa.set(normalizarNome(nome), valor);
  }
  const campo = (...nomes: string[]) => {
    for (const n of nomes) {
      const v = mapa.get(normalizarNome(n));
      if (v) return v;
    }
    return undefined;
  };
  return { mapa, campo };
}

/** "17/12/2025 15:27" (hora local) ou "2025-12-17 15:27:00" (UTC da plataforma) */
function lerData(v: unknown, fuso: string, utc: boolean): Date | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  let m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return localParaUtc(+m[3]!, +m[2]!, +m[1]!, +m[4]!, +m[5]!, +(m[6] ?? 0), fuso);
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return utc ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0))) : localParaUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0), fuso);
  return undefined;
}

export type ResultadoIngestao = {
  eventoId: string;
  contatoId: string;
  contato: string;
  telefone: string | null;
  atendente: string | null;
  sessoes: number;
  atendimentosNovos: number;
  atendimentosAtualizados: number;
  mensagensNovas: number;
  origemRegra: string | null;
  /** Problemas encontrados no histórico (não impedem a gravação) */
  avisos: string[];
};

export async function ingerirEnvio(chatbot: Chatbot, payload: unknown, tamanhoBytes: number): Promise<ResultadoIngestao> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new EnvioInvalido("O corpo precisa ser um objeto JSON (o contato da plataforma)");
  const p = payload as Record<string, any>;
  const idExterno = String(p.id ?? p.user_id ?? "").trim();
  if (!idExterno) throw new EnvioInvalido('Faltou o "id" do contato');
  const { mapa, campo } = leitorCampos(p);
  const fuso = chatbot.fuso;

  // ---------- dados do envio ----------
  const { msgs, recentes, corte, buraco } = montarHistorico(mapa, fuso);
  const sessoes = separarAtendimentos(msgs, corte);

  // ---------- conferência do envio ----------
  // O envio sai logo depois do encerramento: a última mensagem tem que ser o encerramento,
  // com o mesmo protocolo do campo "protocolo numero", poucos minutos antes do envio.
  const avisos: string[] = [];
  const ultimaMsg = (recentes.length ? recentes : msgs).at(-1);
  const momento = lerMomento(campo("Momento Envio"), fuso) ?? new Date();
  const protocoloCampo = campo("protocolo numero", "Numero Protocolo", "Protocolo")?.replace(/\D/g, "") || null;
  if (!msgs.length) avisos.push("O envio chegou sem histórico de conversa.");
  else if (!recentes.length) avisos.push('O campo "Historico 50" veio vazio: o atendimento atual pode estar faltando.');
  if (ultimaMsg) {
    if (!ehEncerramento(ultimaMsg))
      avisos.push(`A última mensagem do histórico (${fmtAviso(ultimaMsg.em, fuso)}) não é a de encerramento: o histórico pode estar incompleto.`);
    else if (protocoloCampo && protocoloDaMensagem(ultimaMsg) && protocoloDaMensagem(ultimaMsg) !== protocoloCampo)
      avisos.push(`O encerramento cita o protocolo ${protocoloDaMensagem(ultimaMsg)}, mas o campo "protocolo numero" veio ${protocoloCampo}.`);
    if (momento.getTime() - ultimaMsg.em.getTime() > ATRASO_MAXIMO_MS)
      avisos.push(`Histórico desatualizado: a última mensagem é de ${fmtAviso(ultimaMsg.em, fuso)} e o envio saiu ${fmtAviso(momento, fuso)}.`);
  }
  if (buraco)
    avisos.push(
      `Faltou um trecho da conversa entre ${fmtAviso(buraco.de, fuso)} e ${fmtAviso(buraco.ate, fuso)} ("Historico Conversa" veio cortado). O atendimento desse intervalo fica marcado como incompleto.`,
    );

  const nomesEtiquetas = campo("Etiquetas Nomes", "user_tags");
  const etiquetasNomes = nomesEtiquetas
    ? nomesEtiquetas.split(/\s*,\s*/).filter(Boolean)
    : (Array.isArray(p.tags) ? p.tags : []).map((t: any) => `#${t?.id ?? t}`).filter((x: string) => x !== "#undefined");
  const anuncio: DadosAnuncio = {
    titulo: campo("ADS Titulo"),
    texto: campo("ADS Texto"),
    ctwa: campo("ADS CTWA"),
    link: campo("ADS Link"),
    plataforma: campo("ADS Plataforma"),
    campanha: campo("ADS Campanha"),
    nome: campo("ADS Nome"),
    formulario: campo("Formulario Lead"),
  };
  const temAnuncio = Object.values(anuncio).some(Boolean);
  const fonte = campo("Fonte do contato", "Fonte") ?? null;
  const canalBruto = campo("Canal da Conversa", "Canal") ?? null;
  const canal = canalBruto && !/ainda nao descobri/i.test(normalizarNome(canalBruto)) ? canalBruto : null;
  const camposGuardados = Object.fromEntries(
    [...mapa.entries()].filter(([k]) => !k.startsWith("historico")).map(([k, v]) => [k, v.length > MAX_VALOR_CAMPO ? v.slice(0, MAX_VALOR_CAMPO) + "…" : v]),
  );
  const nomeAtendente = campo("Atendente", "Consultor");
  const idAtendente = campo("Atendente ID");

  return db.transaction(async (tx) => {
    // Serializa envios do mesmo contato
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${chatbot.id + ":" + idExterno}))`);
    if (!chatbot.contaExterna && (p.account_id || p.page_id)) {
      await tx.execute(sql`update chatbots set conta_externa = ${String(p.account_id ?? p.page_id)} where id = ${chatbot.id} and conta_externa is null`);
    }

    // ---------- contato ----------
    const dadosContato = {
      nome: String(p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ") ?? "").replace(/\s+/g, " ").trim(),
      telefone: typeof p.phone === "string" && p.phone.trim() ? p.phone.replace(/\D/g, "") : null,
      cidade: campo("cidade", "Cidade Contato", "Municipio") ?? null,
      criadoNaPlataformaEm: lerData(p.subscribed_date ?? p.created_at, fuso, true) ?? lerData(campo("Data Criacao Contato"), fuso, false) ?? null,
      linkConversa: campo("Link Conversa") ?? null,
      etiquetas: etiquetasNomes,
      campos: camposGuardados,
      atualizadoEm: new Date(),
    };
    const [contato] = await tx
      .insert(contatos)
      .values({ empresaId: chatbot.empresaId, chatbotId: chatbot.id, idExterno, ...dadosContato })
      .onConflictDoUpdate({ target: [contatos.chatbotId, contatos.idExterno], set: dadosContato })
      .returning();

    // ---------- atendentes ----------
    const equipe = await tx.select().from(atendentes).where(eq(atendentes.empresaId, chatbot.empresaId));
    const acharOuCriar = async (nome: string, id?: string): Promise<Atendente> => {
      const n = nomeDeAtendente(nome);
      let a =
        (id && equipe.find((x) => x.idExterno === id)) ||
        equipe.find((x) => x.nomeNormalizado === n || x.apelidos.includes(n));
      if (!a && !id) {
        // No histórico vem só o primeiro nome: casa com quem tem esse primeiro nome (se for um só)
        const mesmos = equipe.filter((x) => x.nomeNormalizado.split(" ")[0] === n);
        if (mesmos.length === 1) a = mesmos[0];
      }
      if (a) {
        if (id && !a.idExterno) {
          await tx.update(atendentes).set({ idExterno: id }).where(eq(atendentes.id, a.id));
          a.idExterno = id;
        }
        if (n !== a.nomeNormalizado && !a.apelidos.includes(n) && n.split(" ").length === 1) {
          a.apelidos = [...a.apelidos, n];
          await tx.update(atendentes).set({ apelidos: a.apelidos }).where(eq(atendentes.id, a.id));
        }
        return a;
      }
      const [novo] = await tx
        .insert(atendentes)
        .values({ empresaId: chatbot.empresaId, nome: nome.replace(/\s+/g, " ").trim(), nomeNormalizado: n, idExterno: id ?? null })
        .onConflictDoUpdate({ target: [atendentes.empresaId, atendentes.nomeNormalizado], set: { ativo: true } })
        .returning();
      equipe.push(novo!);
      return novo!;
    };
    const atribuido = nomeAtendente ? await acharOuCriar(nomeAtendente, idAtendente) : null;
    const humanoPorNome = new Map<string, Atendente>();
    for (const m of msgs) {
      if (m.tipo !== "humano") continue;
      const n = nomeDeAtendente(m.remetente);
      if (humanoPorNome.has(n)) continue;
      // O primeiro nome do atendente atribuído tem preferência
      const doAtribuido = atribuido && atribuido.nomeNormalizado.split(" ")[0] === n ? atribuido : null;
      humanoPorNome.set(n, doAtribuido ?? (await acharOuCriar(m.remetente)));
    }

    // ---------- atendimentos ----------
    let novos = 0;
    let atualizados = 0;
    let mensagensNovas = 0;
    let origemRegra: string | null = null;
    const limiteIa = Date.now() - JANELA_IA_DIAS * 86_400_000;

    const tratados: string[] = [];
    for (const [i, s] of sessoes.entries()) {
      const ultima = i === sessoes.length - 1;
      const inicio = s.mensagens[0]!.em;
      const fim = s.mensagens.at(-1)!.em;
      // Mesmo atendimento: mesma chave, ou mesmo período (o início pode ter sido cortado no envio anterior)
      const [existente] =
        (await tx.select().from(atendimentos).where(and(eq(atendimentos.contatoId, contato!.id), eq(atendimentos.chave, s.chave)))).concat(
          await tx
            .select()
            .from(atendimentos)
            .where(
              and(
                eq(atendimentos.contatoId, contato!.id),
                lt(atendimentos.inicioEm, fim),
                gt(atendimentos.ultimaMsgEm, inicio),
                // não casa com um atendimento que este mesmo envio acabou de gravar
                tratados.length ? notInArray(atendimentos.id, tratados) : undefined,
              ),
            )
            .limit(1),
        );

      // Junta com o que já estava guardado desse atendimento (envios anteriores podem ter mais mensagens)
      let todas: Mensagem[] = s.mensagens;
      if (existente) {
        const guardadas = await tx.select().from(mensagens).where(eq(mensagens.atendimentoId, existente.id));
        const conhecidas = new Set(s.mensagens.map((m) => m.chave));
        const extras: Mensagem[] = guardadas
          .filter((g) => !conhecidas.has(g.chave))
          .map((g) => ({ em: g.enviadaEm, seq: g.seq, tipo: g.remetenteTipo, remetente: g.remetenteNome, texto: g.texto, chave: g.chave }));
        if (extras.length) todas = juntarHistoricos(s.mensagens, extras);
      }
      const t = calcularTempos(todas, chatbot.horario, fuso);
      // Faltaram mensagens (buraco no histórico) e nem o que já estava guardado tem o encerramento:
      // não dá para afirmar "sem humano" nem contar mensagens sem resposta
      const incompleto = !!s.incompleta && !todas.some(ehEncerramento);
      if (incompleto) {
        t.semHumano = false;
        t.semResposta = 0;
        if (t.tempoAteHumanoS === null) t.atendidoAte30 = null;
      }
      const humanosIds = t.humanos.map((h) => humanoPorNome.get(nomeDeAtendente(h.remetente))).filter((x): x is Atendente => !!x);
      const principal = (ultima && atribuido) || humanosIds.at(-1) || null;
      const novaChave = s.protocolo ? s.chave : (existente?.protocolo ? existente.chave : s.chave);

      // Regras de origem e dados de anúncio/fonte valem para o atendimento atual (o envio é sobre ele)
      const textoRegras = ultima ? [todas.map((m) => m.texto).join("\n"), ...Object.values(anuncio).filter(Boolean)].join("\n") : "";
      const regra =
        ultima && existente?.classificacaoStatus !== "manual"
          ? await aplicarRegras(tx, chatbot.empresaId, { etiquetas: etiquetasNomes, fonte, canal, anuncioPlataforma: anuncio.plataforma, texto: textoRegras })
          : null;
      if (ultima && regra) origemRegra = regra.descricao;

      const mudou = !existente || existente.ultimaMsgEm.getTime() !== t.ultimaMsgEm.getTime() || existente.msgsCliente + existente.msgsBot + existente.msgsApi + existente.msgsHumano !== todas.length;
      const paraIa = fim.getTime() >= limiteIa && existente?.classificacaoStatus !== "manual" && (mudou || !!regra !== !!existente?.origemRegraId);

      const valores = {
        empresaId: chatbot.empresaId,
        chatbotId: chatbot.id,
        contatoId: contato!.id,
        chave: novaChave,
        protocolo: s.protocolo ?? existente?.protocolo ?? null,
        inicioEm: t.inicioEm,
        ultimaMsgEm: t.ultimaMsgEm,
        primeiraMsgClienteEm: t.primeiraMsgClienteEm,
        transferenciaEm: t.transferenciaEm,
        primeiraRespostaHumanaEm: t.primeiraRespostaHumanaEm,
        atendenteId: principal?.id ?? existente?.atendenteId ?? null,
        primeiroAtendenteId: humanosIds[0]?.id ?? null,
        msgsCliente: t.msgsCliente,
        msgsBot: t.msgsBot,
        msgsApi: t.msgsApi,
        msgsHumano: t.msgsHumano,
        tempoAteHumanoS: t.tempoAteHumanoS,
        tempoPrimeiraRespostaS: t.tempoPrimeiraRespostaS,
        tempoMedioRespostaS: t.tempoMedioRespostaS,
        tempoMaxRespostaS: t.tempoMaxRespostaS,
        respostasMedidas: t.respostasMedidas,
        esperasAcima30: t.esperasAcima30,
        semResposta: t.semResposta,
        precisouHumano: t.precisouHumano,
        semHumano: t.semHumano,
        atendidoAte30: t.atendidoAte30,
        duracaoS: t.duracaoS,
        transferencias: t.transferencias,
        foraHorario: t.foraHorario,
        historicoIncompleto: incompleto,
        leadNovo:
          !!dadosContato.criadoNaPlataformaEm &&
          dadosContato.criadoNaPlataformaEm.getTime() >= t.inicioEm.getTime() - 2 * 3600_000 &&
          dadosContato.criadoNaPlataformaEm.getTime() <= t.ultimaMsgEm.getTime(),
        ...(ultima && {
          fonte,
          canal,
          refEntrada: campo("Ref Entrada") ?? null,
          anuncioPlataforma: anuncio.plataforma ?? null,
          anuncio: temAnuncio ? anuncio : null,
        }),
        ...(ultima && !existente?.cidade && dadosContato.cidade ? { cidade: dadosContato.cidade } : {}),
        ...(regra && { origemId: regra.origemId, origemRegraId: regra.id }),
        ...(paraIa && { classificacaoStatus: "pendente" as const, classificacaoTentativas: 0, classificacaoErro: null }),
        ...(!existente && !paraIa ? { classificacaoStatus: "classificado" as const } : {}),
        atualizadoEm: new Date(),
      };

      let atendimentoId: string;
      if (existente) {
        await tx.update(atendimentos).set(valores).where(eq(atendimentos.id, existente.id));
        atendimentoId = existente.id;
        tratados.push(atendimentoId);
        if (mudou) atualizados++;
      } else {
        const [novo] = await tx
          .insert(atendimentos)
          .values(valores)
          .onConflictDoUpdate({ target: [atendimentos.contatoId, atendimentos.chave], set: valores })
          .returning({ id: atendimentos.id });
        atendimentoId = novo!.id;
        tratados.push(atendimentoId);
        novos++;
      }

      // Humanos que falaram, na ordem
      await tx.delete(atendimentoAtendentes).where(eq(atendimentoAtendentes.atendimentoId, atendimentoId));
      const vistos = new Set<string>();
      const linhas = t.humanos
        .map((h) => ({ h, a: humanoPorNome.get(nomeDeAtendente(h.remetente)) }))
        .filter(({ a }) => a && !vistos.has(a.id) && vistos.add(a.id))
        .map(({ h, a }, ordem) => ({ atendimentoId, atendenteId: a!.id, ordem, primeiraMsgEm: h.primeiraMsgEm, mensagens: h.mensagens }));
      if (linhas.length) await tx.insert(atendimentoAtendentes).values(linhas);

      // Mensagens (as que já existiam só são religadas a este atendimento)
      const novasMsgs = await gravarMensagens(tx, contato!.id, atendimentoId, s, humanoPorNome);
      mensagensNovas += novasMsgs;
    }

    const [evento] = await tx
      .insert(webhookEventos)
      .values({
        empresaId: chatbot.empresaId,
        chatbotId: chatbot.id,
        contatoId: contato!.id,
        payload: p,
        tamanhoBytes,
        status: "processado",
        resultado: {
          sessoes: sessoes.length,
          atendimentos_novos: novos,
          atendimentos_atualizados: atualizados,
          mensagens_novas: mensagensNovas,
          mensagens_no_historico: msgs.length,
          momento_envio: campo("Momento Envio") ?? null,
          origem_regra: origemRegra,
          avisos,
        },
      })
      .returning({ id: webhookEventos.id });

    return {
      eventoId: evento!.id,
      contatoId: contato!.id,
      contato: dadosContato.nome,
      telefone: dadosContato.telefone,
      atendente: atribuido?.nome ?? null,
      sessoes: sessoes.length,
      atendimentosNovos: novos,
      atendimentosAtualizados: atualizados,
      mensagensNovas,
      origemRegra,
      avisos,
    };
  });
}

async function gravarMensagens(tx: Tx, contatoId: string, atendimentoId: string, s: Sessao, humanos: Map<string, Atendente>): Promise<number> {
  if (!s.mensagens.length) return 0;
  const linhas = s.mensagens.map((m) => ({
    contatoId,
    atendimentoId,
    enviadaEm: m.em,
    seq: m.seq,
    remetenteTipo: m.tipo,
    remetenteNome: m.remetente,
    atendenteId: m.tipo === "humano" ? (humanos.get(nomeDeAtendente(m.remetente))?.id ?? null) : null,
    texto: m.texto,
    chave: m.chave,
  }));
  const antes = await tx
    .select({ chave: mensagens.chave })
    .from(mensagens)
    .where(and(eq(mensagens.contatoId, contatoId), inArray(mensagens.chave, linhas.map((l) => l.chave))));
  for (let i = 0; i < linhas.length; i += 200) {
    await tx
      .insert(mensagens)
      .values(linhas.slice(i, i + 200))
      .onConflictDoUpdate({ target: [mensagens.contatoId, mensagens.chave], set: { atendimentoId, seq: sql`excluded.seq` } });
  }
  return linhas.length - antes.length;
}
