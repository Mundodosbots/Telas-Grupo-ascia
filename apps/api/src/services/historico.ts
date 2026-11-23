/**
 * Histórico de conversa da plataforma ({{chat_history_details}} / {{chat_history_details_large}}):
 *
 *   Usuário (2026-06-13 7:57am): Olá, vi o anúncio...
 *   Bot (2026-06-13 7:57am): aguarde que em breve um de nossos atendentes...
 *   --- (2025-12-17 3:28pm): Olá... Meu nome é RUDISON          ← enviada por API (Grow, agendamento…)
 *   OSVALDO (2026-06-13 8:30am): bom dia                          ← atendente humano (primeiro nome)
 *
 * Funções puras: ler, juntar as duas versões, separar em atendimentos e calcular os tempos.
 */
import type { HorarioAtendimento } from "../db/schema";

export type TipoRemetente = "cliente" | "bot" | "api" | "humano";

export type Mensagem = {
  em: Date;
  /** posição dentro do mesmo minuto */
  seq: number;
  tipo: TipoRemetente;
  /** como veio no histórico ("OSVALDO", "Bot", "Usuário") */
  remetente: string;
  texto: string;
  /** identidade estável para não duplicar */
  chave: string;
};

/** "Nome (2026-11-23 9:20am): texto" — a plataforma escreve dia e mês sem zero à esquerda ("2026-11-9", "2026-3-6") */
const CABECALHO = /^(.{0,80}?) \((\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2})(?::(\d{2}))?\s?([ap]m)\):[ \t]?/gim;

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function tipoDoRemetente(nome: string): TipoRemetente {
  const n = normalizar(nome);
  if (n === "usuario" || n === "user" || n === "cliente" || n === "contato") return "cliente";
  if (n === "bot" || n === "robo" || n === "eu") return "bot";
  if (!n || /^-+$/.test(n)) return "api";
  return "humano";
}

/** Diferença (ms) entre o relógio local do fuso e o UTC naquele instante */
function deslocamentoMs(instante: number, fuso: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instante));
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const local = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return local - Math.floor(instante / 1000) * 1000;
}

/** Hora local (no fuso) → instante UTC */
export function localParaUtc(ano: number, mes: number, dia: number, hora: number, minuto: number, segundo: number, fuso: string): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  let utc = palpite - deslocamentoMs(palpite, fuso);
  // segunda passada acerta trocas de horário de verão
  utc = palpite - deslocamentoMs(utc, fuso);
  return new Date(utc);
}

/** Lê o texto do histórico. Mensagens fora do formato ficam grudadas na anterior. */
export function lerHistorico(texto: string | null | undefined, fuso: string): Mensagem[] {
  if (!texto) return [];
  const cabecalhos = [...texto.matchAll(CABECALHO)];
  const lista: Mensagem[] = [];
  const ocorrencias = new Map<string, number>();
  let ultimoMinuto = "";
  let seq = 0;
  for (const [i, m] of cabecalhos.entries()) {
    const fim = i + 1 < cabecalhos.length ? cabecalhos[i + 1]!.index! : texto.length;
    const corpo = texto.slice(m.index! + m[0].length, fim).replace(/\s+$/, "");
    let hora = Number(m[5]) % 12;
    if (m[8]!.toLowerCase() === "pm") hora += 12;
    const em = localParaUtc(Number(m[2]), Number(m[3]), Number(m[4]), hora, Number(m[6]), Number(m[7] ?? 0), fuso);
    const minuto = em.toISOString();
    seq = minuto === ultimoMinuto ? seq + 1 : 0;
    ultimoMinuto = minuto;
    const remetente = m[1]!.trim() || "---";
    const tipo = tipoDoRemetente(remetente);
    // Identidade: instante + remetente + texto (+ n-ésima repetição idêntica no mesmo minuto)
    const base = `${minuto}|${tipo}|${normalizar(remetente)}|${normalizar(corpo).slice(0, 500)}`;
    const n = (ocorrencias.get(base) ?? 0) + 1;
    ocorrencias.set(base, n);
    lista.push({ em, seq, tipo, remetente, texto: corpo, chave: `${hashCurto(base)}#${n}` });
  }
  return lista;
}

function hashCurto(s: string): string {
  return new Bun.CryptoHasher("sha1").update(s).digest("hex").slice(0, 20);
}

/**
 * Junta as versões do histórico (200 mensagens, que corta o final em conversas longas,
 * e 50 mensagens, que sempre traz o atendimento atual) sem repetir mensagens.
 */
export function juntarHistoricos(...listas: Mensagem[][]): Mensagem[] {
  const porChave = new Map<string, Mensagem>();
  for (const l of listas) for (const m of l) if (!porChave.has(m.chave)) porChave.set(m.chave, m);
  const todas = [...porChave.values()].sort((a, b) => a.em.getTime() - b.em.getTime() || a.seq - b.seq);
  // reenumera a posição dentro do minuto depois de juntar
  let anterior = 0;
  let seq = 0;
  for (const m of todas) {
    seq = m.em.getTime() === anterior ? seq + 1 : 0;
    anterior = m.em.getTime();
    m.seq = seq;
  }
  return todas;
}

/* ------------------------------------------------------------------ */
/* Atendimentos                                                         */
/* ------------------------------------------------------------------ */

// Comparados com o texto já sem acentos e em minúsculas (normalizar)
const PROTOCOLO_INICIO = /protocolo de atendimento (?:e|eh)?\s*:?\s*\*?\s*(\d{3,})/;
const PROTOCOLO_QUALQUER = /protocolo\s*(?:de atendimento)?\s*(?:e|no?\.?|numero)?\s*:?\s*\*?\s*(\d{3,})/;
/** Mensagem que fecha o atendimento (do atendente ou do robô) */
const ENCERRAMENTO = /agradece o contato|estamos encerrando|atendimento (foi )?(encerrado|finalizado)|numero de protocolo/;
/** Robô avisando que vai passar para humano, ou apresentação automática do consultor */
export const TRANSFERENCIA =
  /(aguarde|em breve|em instantes|ja ja|vou (te )?(transferir|encaminhar|conectar)|iremos (transferir|encaminhar)).{0,90}(atendente|consultor|equipe|especialista|vendedor|agente|time)|transferi(r|ndo|do) (seu|o) (contato|atendimento)|meu nome e .{0,80}(consultor|atendimento|vendas|vendedor)/;
/** Pausa que separa conversas antigas sem protocolo */
const PAUSA_NOVA_CONVERSA_MS = 8 * 3600_000;
/** Dentro de um protocolo, só uma pausa muito longa separa (o cliente pode responder no dia seguinte) */
const PAUSA_MESMO_PROTOCOLO_MS = 72 * 3600_000;
/** Mensagens do cliente logo antes do protocolo pertencem ao novo atendimento */
const JANELA_ANTES_PROTOCOLO_MS = 30 * 60_000;
/**
 * Depois do encerramento, o que chega logo em seguida (resposta da pesquisa "😍 Ótimo", "obrigada")
 * ainda é do mesmo atendimento. Passado esse tempo, a próxima mensagem abre outro.
 */
export const JANELA_POS_ENCERRAMENTO_MS = 60 * 60_000;

export type Sessao = {
  chave: string;
  protocolo: string | null;
  mensagens: Mensagem[];
  /** Tem a mensagem de encerramento */
  encerrada?: boolean;
  /** Foi cortada por um buraco no histórico antes de encerrar (faltam mensagens) */
  incompleta?: boolean;
};

/** A mensagem fecha o atendimento? (do atendente ou do robô) */
export const ehEncerramento = (m: Mensagem) => m.tipo !== "cliente" && ENCERRAMENTO.test(normalizar(m.texto));
/** Número de protocolo citado numa mensagem (ex.: "Numero de protocolo: 54236") */
export const protocoloDaMensagem = (m: Mensagem) => PROTOCOLO_QUALQUER.exec(normalizar(m.texto))?.[1] ?? null;

/**
 * Separa o histórico em atendimentos.
 * `corte`: começo de um trecho que veio depois de um buraco no histórico (mensagens que faltaram).
 * Nada atravessa o corte; o atendimento que ficou aberto antes dele é marcado como incompleto.
 */
export function separarAtendimentos(msgs: Mensagem[], corte?: Date | null): Sessao[] {
  const sessoes: Sessao[] = [];
  let atual: Sessao | null = null;
  const encerradas = new Set<Sessao>();
  /** Última mensagem de encerramento de cada atendimento */
  const fechamento = new Map<Sessao, Mensagem>();
  const nova = (protocolo: string | null): Sessao => {
    const s: Sessao = { chave: "", protocolo, mensagens: [] };
    sessoes.push(s);
    return s;
  };

  for (const m of msgs) {
    const anterior = atual?.mensagens.at(-1);
    // Buraco no histórico: o que vem depois começa outro bloco; o anterior, se não encerrou, está incompleto
    if (atual && anterior && corte && anterior.em < corte && m.em >= corte) {
      if (!encerradas.has(atual)) atual.incompleta = true;
      atual = null;
    }
    const pausa = anterior && atual ? m.em.getTime() - anterior.em.getTime() : 0;
    // Conversa com protocolo continua mesmo de um dia para o outro; sem protocolo, pausa longa separa
    const limite = atual?.protocolo ? PAUSA_MESMO_PROTOCOLO_MS : PAUSA_NOVA_CONVERSA_MS;
    const texto = normalizar(m.texto);
    const encerra = m.tipo !== "cliente" && ENCERRAMENTO.test(texto);
    const fechou = atual ? fechamento.get(atual) : undefined;
    if (
      !atual ||
      // pausa longa separa — menos quando é a mensagem de encerramento chegando atrasada
      (pausa > limite && !(encerra && !encerradas.has(atual))) ||
      // depois do encerramento, só o que chega logo em seguida (pesquisa, "obrigada") fica neste atendimento
      (fechou && !encerra && m.em.getTime() - fechou.em.getTime() > JANELA_POS_ENCERRAMENTO_MS)
    )
      atual = nova(null);

    // Robô, integração ou atendente abrem protocolo ("Seu protocolo de atendimento é X"); texto sem acentos e minúsculo
    const inicio = m.tipo !== "cliente" ? PROTOCOLO_INICIO.exec(texto)?.[1] : undefined;
    // O robô reiniciou o fluxo (novo protocolo) antes de qualquer atendente falar e sem encerrar: é o mesmo atendimento
    const reinicio =
      !!inicio &&
      !!atual.protocolo &&
      atual.protocolo !== inicio &&
      !encerradas.has(atual) &&
      !atual.mensagens.some((x) => x.tipo === "humano") &&
      m.em.getTime() - atual.mensagens[0]!.em.getTime() <= JANELA_POS_ENCERRAMENTO_MS;
    if (reinicio) {
      atual.protocolo = inicio!;
    } else if (inicio && atual.protocolo && atual.protocolo !== inicio) {
      // Novo protocolo: começa outro atendimento e leva junto as mensagens que o provocaram
      const anteriorSessao: Sessao = atual;
      atual = nova(inicio);
      const levar: Mensagem[] = [];
      const fim = fechamento.get(anteriorSessao);
      while (anteriorSessao.mensagens.length) {
        const ult = anteriorSessao.mensagens.at(-1)!;
        // Atendimento anterior já encerrado: tudo o que veio depois do encerramento é do novo
        if (fim ? ult === fim : ult.tipo !== "cliente" || m.em.getTime() - ult.em.getTime() > JANELA_ANTES_PROTOCOLO_MS) break;
        levar.unshift(anteriorSessao.mensagens.pop()!);
      }
      atual.mensagens.push(...levar);
      if (!anteriorSessao.mensagens.length) sessoes.splice(sessoes.indexOf(anteriorSessao), 1);
    } else if (inicio && !atual.protocolo) {
      atual.protocolo = inicio;
    } else if (!atual.protocolo && m.tipo !== "cliente") {
      const qualquer = PROTOCOLO_QUALQUER.exec(texto)?.[1];
      if (qualquer) atual.protocolo = qualquer;
    }
    atual.mensagens.push(m);
    if (encerra) {
      encerradas.add(atual);
      fechamento.set(atual, m);
    }
  }
  // Mesmo protocolo em dois blocos (ex.: mensagem de encerramento dias depois) = o mesmo atendimento
  const juntas: Sessao[] = [];
  for (const s of sessoes.filter((x) => x.mensagens.length)) {
    const mesma = s.protocolo ? juntas.find((j) => j.protocolo === s.protocolo) : undefined;
    if (mesma) {
      mesma.mensagens.push(...s.mensagens);
      mesma.incompleta = mesma.incompleta || s.incompleta;
    } else juntas.push(s);
  }
  for (const s of juntas) {
    s.mensagens.sort((a, b) => a.em.getTime() - b.em.getTime() || a.seq - b.seq);
    s.chave = s.protocolo ? `p:${s.protocolo}` : `t:${s.mensagens[0]!.em.toISOString()}`;
    s.encerrada = s.mensagens.some(ehEncerramento);
    if (s.encerrada) s.incompleta = false;
  }
  return juntas;
}

/* ------------------------------------------------------------------ */
/* Tempo útil (só o que cai dentro do horário de atendimento)           */
/* ------------------------------------------------------------------ */

const minutosDoDia = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function partesLocais(d: Date, fuso: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { ano: Number(v("year")), mes: Number(v("month")), dia: Number(v("day")), semana: dias.indexOf(v("weekday")), minutos: Number(v("hour")) * 60 + Number(v("minute")) };
}

export function dentroDoHorario(d: Date, horario: HorarioAtendimento, fuso: string): boolean {
  if (!Object.keys(horario).length) return true;
  const l = partesLocais(d, fuso);
  return (horario[String(l.semana)] ?? []).some(([a, b]) => l.minutos >= minutosDoDia(a) && l.minutos < minutosDoDia(b));
}

/** Segundos entre a e b contando só o horário de atendimento (sem horário configurado = corrido) */
export function segundosUteis(a: Date, b: Date, horario: HorarioAtendimento, fuso: string): number {
  const total = (b.getTime() - a.getTime()) / 1000;
  if (total <= 0) return 0;
  if (!Object.keys(horario).length) return Math.round(total);
  let soma = 0;
  const inicioDia = partesLocais(a, fuso);
  // percorre dia a dia (no máximo 60 dias)
  for (let i = 0; i < 61; i++) {
    const base = new Date(Date.UTC(inicioDia.ano, inicioDia.mes - 1, inicioDia.dia + i, 12));
    const l = partesLocais(base, fuso);
    for (const [ini, fim] of horario[String(l.semana)] ?? []) {
      const ji = localParaUtc(l.ano, l.mes, l.dia, Math.floor(minutosDoDia(ini) / 60), minutosDoDia(ini) % 60, 0, fuso).getTime();
      const jf = localParaUtc(l.ano, l.mes, l.dia, Math.floor(minutosDoDia(fim) / 60), minutosDoDia(fim) % 60, 0, fuso).getTime();
      const s = Math.max(ji, a.getTime());
      const e = Math.min(jf, b.getTime());
      if (e > s) soma += (e - s) / 1000;
    }
    if (base.getTime() > b.getTime() + 86_400_000) break;
  }
  return Math.round(soma);
}

/* ------------------------------------------------------------------ */
/* Tempos de um atendimento                                             */
/* ------------------------------------------------------------------ */

export const LIMITE_ESPERA_S = 30 * 60;

export type Tempos = {
  inicioEm: Date;
  ultimaMsgEm: Date;
  primeiraMsgClienteEm: Date | null;
  transferenciaEm: Date | null;
  primeiraRespostaHumanaEm: Date | null;
  msgsCliente: number;
  msgsBot: number;
  msgsApi: number;
  msgsHumano: number;
  tempoAteHumanoS: number | null;
  tempoPrimeiraRespostaS: number | null;
  tempoMedioRespostaS: number | null;
  tempoMaxRespostaS: number | null;
  respostasMedidas: number;
  esperasAcima30: number;
  semResposta: number;
  /** Chegou na fila humana (o robô transferiu ou um humano falou) */
  precisouHumano: boolean;
  semHumano: boolean;
  atendidoAte30: boolean | null;
  duracaoS: number | null;
  /** humanos na ordem em que entraram, com quantas mensagens cada */
  humanos: { remetente: string; primeiraMsgEm: Date; mensagens: number }[];
  transferencias: number;
  foraHorario: boolean;
  /** O atendente falou antes do cliente: a empresa iniciou a conversa (não há espera do robô até o humano) */
  iniciadoPelaEmpresa: boolean;
};

/**
 * O que importa para medir um atendimento:
 * - fila: começa na mensagem do robô que transfere (ou na 1ª do cliente);
 * - ativo: o atendente falou antes do cliente (a empresa puxou a conversa, ex.: confirmar agendamento),
 *   então não existe "espera do robô até o humano";
 * - pós-encerramento: o que o cliente manda depois do encerramento (resposta da pesquisa, "obrigada")
 *   não é mensagem esperando resposta, a não ser que um atendente volte a falar depois.
 */
function analisar<M extends { em: Date; tipo: string; texto: string }>(msgs: M[]) {
  const iCliente = msgs.findIndex((m) => m.tipo === "cliente");
  const iHumano = msgs.findIndex((m) => m.tipo === "humano");
  const primeiraCliente = iCliente >= 0 ? msgs[iCliente]! : null;
  const primeiraHumana = iHumano >= 0 ? msgs[iHumano]! : null;
  const ativo = iHumano >= 0 && (iCliente < 0 || iHumano < iCliente);
  const transferencia =
    msgs.find((m) => (m.tipo === "bot" || m.tipo === "api") && TRANSFERENCIA.test(normalizar(m.texto)) && (!primeiraHumana || m.em <= primeiraHumana.em)) ?? null;
  const inicioFila = transferencia?.em ?? primeiraCliente?.em ?? null;
  let iFim = -1;
  msgs.forEach((m, i) => {
    if (m.tipo !== "cliente" && ENCERRAMENTO.test(normalizar(m.texto))) iFim = i;
  });
  if (iFim >= 0 && msgs.slice(iFim + 1).some((m) => m.tipo === "humano")) iFim = -1; // a conversa continuou
  /** Mensagens do cliente que abrem um bloco na fila, com a resposta humana (se veio) */
  const blocos: { i: number; resposta: M | null }[] = [];
  // A fila começa na posição da transferência (mensagens do cliente no mesmo minuto, mas antes dela, não contam)
  const iFila = transferencia ? msgs.indexOf(transferencia) : iCliente;
  msgs.forEach((m, i) => {
    if (m.tipo !== "cliente" || !inicioFila || iFila < 0 || i < iFila) return;
    if (i > 0 && msgs[i - 1]!.tipo === "cliente") return; // mesmo bloco
    if (iFim >= 0 && i > iFim) return; // depois do encerramento
    blocos.push({ i, resposta: msgs.slice(i + 1).find((x) => x.tipo === "humano") ?? null });
  });
  return { primeiraCliente, primeiraHumana, ativo, transferencia, inicioFila, iFim, blocos };
}

export function calcularTempos(msgs: Mensagem[], horario: HorarioAtendimento, fuso: string): Tempos {
  const util = (a: Date, b: Date) => segundosUteis(a, b, horario, fuso);
  const conta = (t: TipoRemetente) => msgs.filter((m) => m.tipo === t).length;
  const { primeiraCliente, primeiraHumana, ativo, transferencia, inicioFila, blocos } = analisar(msgs);

  // Espera de cada bloco de mensagens do cliente até a próxima resposta humana (depois que entrou na fila)
  const esperas: number[] = [];
  let semResposta = 0;
  for (const b of blocos) {
    if (b.resposta) esperas.push(util(msgs[b.i]!.em, b.resposta.em));
    else if (primeiraHumana) semResposta++;
  }

  const humanos: Tempos["humanos"] = [];
  for (const m of msgs) {
    if (m.tipo !== "humano") continue;
    const nome = normalizar(m.remetente);
    const h = humanos.find((x) => normalizar(x.remetente) === nome);
    if (h) h.mensagens++;
    else humanos.push({ remetente: m.remetente.trim(), primeiraMsgEm: m.em, mensagens: 1 });
  }

  const tempoAteHumano = !ativo && primeiraHumana && inicioFila && primeiraHumana.em >= inicioFila ? util(inicioFila, primeiraHumana.em) : null;
  const ultima = msgs.at(-1)!;
  // Só conta como "sem atendimento humano" quem chegou na fila (o robô transferiu); conversa só com robô não
  const precisouHumano = !!transferencia || !!primeiraHumana;
  return {
    inicioEm: msgs[0]!.em,
    ultimaMsgEm: ultima.em,
    primeiraMsgClienteEm: primeiraCliente?.em ?? null,
    transferenciaEm: transferencia?.em ?? null,
    primeiraRespostaHumanaEm: primeiraHumana?.em ?? null,
    msgsCliente: conta("cliente"),
    msgsBot: conta("bot"),
    msgsApi: conta("api"),
    msgsHumano: conta("humano"),
    tempoAteHumanoS: tempoAteHumano,
    tempoPrimeiraRespostaS: !ativo && primeiraHumana && primeiraCliente && primeiraHumana.em >= primeiraCliente.em ? util(primeiraCliente.em, primeiraHumana.em) : null,
    tempoMedioRespostaS: esperas.length ? Math.round(esperas.reduce((s, x) => s + x, 0) / esperas.length) : null,
    tempoMaxRespostaS: esperas.length ? Math.max(...esperas) : null,
    respostasMedidas: esperas.length,
    esperasAcima30: esperas.filter((s) => s > LIMITE_ESPERA_S).length,
    semResposta,
    precisouHumano,
    semHumano: precisouHumano && !!primeiraCliente && !primeiraHumana,
    atendidoAte30: tempoAteHumano !== null ? tempoAteHumano <= LIMITE_ESPERA_S : precisouHumano && primeiraCliente && !primeiraHumana ? false : null,
    duracaoS: primeiraCliente ? Math.round((ultima.em.getTime() - primeiraCliente.em.getTime()) / 1000) : null,
    humanos,
    transferencias: Math.max(0, humanos.length - 1),
    foraHorario: primeiraCliente ? !dentroDoHorario(primeiraCliente.em, horario, fuso) : false,
    iniciadoPelaEmpresa: ativo,
  };
}

export type Marco = "transferencia" | "primeira_humana" | "encerramento" | "contato_ativo";

/**
 * Marca, mensagem a mensagem, o que o painel mede (mesma regra de calcularTempos):
 * a transferência do robô, a 1ª resposta humana, o encerramento e, para cada bloco de mensagens
 * do cliente na fila, quanto tempo (útil) ele esperou pela resposta ou se ficou sem resposta.
 */
export function marcarEsperas<M extends { em: Date; tipo: string; texto: string }>(
  msgs: M[],
  horario: HorarioAtendimento,
  fuso: string,
): (M & { esperaS?: number; semResposta?: boolean; marco?: Marco })[] {
  const util = (a: Date, b: Date) => segundosUteis(a, b, horario, fuso);
  const { primeiraHumana, ativo, transferencia, iFim, blocos } = analisar(msgs);
  const porIndice = new Map(blocos.map((b) => [b.i, b.resposta]));
  return msgs.map((m, i) => {
    const r: M & { esperaS?: number; semResposta?: boolean; marco?: Marco } = { ...m };
    if (m === transferencia && !ativo) r.marco = "transferencia";
    if (m === primeiraHumana) r.marco = ativo ? "contato_ativo" : "primeira_humana";
    if (i === iFim) r.marco = "encerramento";
    if (!porIndice.has(i)) return r;
    const resposta = porIndice.get(i);
    if (resposta) r.esperaS = util(m.em, resposta.em);
    else if (primeiraHumana) r.semResposta = true;
    return r;
  });
}

/** Horário padrão (o que o bot da Fiat informa aos clientes) */
export const HORARIO_PADRAO: HorarioAtendimento = {
  "1": [["07:30", "11:30"], ["13:30", "17:30"]],
  "2": [["07:30", "11:30"], ["13:30", "17:30"]],
  "3": [["07:30", "11:30"], ["13:30", "17:30"]],
  "4": [["07:30", "11:30"], ["13:30", "17:30"]],
  "5": [["07:30", "11:30"], ["13:30", "17:30"]],
  "6": [["07:30", "11:30"]],
};
