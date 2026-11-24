import { eq, isNull, sql, type SQL } from "drizzle-orm";
import { atendimentos } from "../db/schema";
import { env } from "../env";
import { ehUuid, normalizarTelefone } from "./util";

export type FiltroAtendimentos = {
  chatbot_id?: string;
  atendente_id?: string;
  time_id?: string;
  /** uuid, ou "nenhuma" para sem origem */
  origem_id?: string;
  /** uuid, ou "nenhum" para sem departamento */
  departamento_id?: string;
  etiqueta_id?: string;
  /** Etiqueta da plataforma (id da tabela etiquetas_plataforma): o contato tinha a etiqueta neste atendimento */
  etiqueta_plataforma?: string;
  canal?: string;
  fonte?: string;
  cidade?: string;
  /** YYYY-MM-DD (fuso dos relatórios), sobre o início do atendimento */
  inicio?: string;
  fim?: string;
  busca?: string;
  /** "1" = só quem foi para a fila humana */
  humano?: string;
  /** "1" = só leads novos · "0" = só quem já era contato */
  novo?: string;
  /** Recorte vindo de um número ou gráfico do painel (veja SITUACOES) */
  situacao?: string;
  /** Faixa de tempo (0–5, veja FAIXAS_S) do robô até o humano / da resposta média */
  faixa_humano?: string;
  faixa_resposta?: string;
  /** Dia da semana (0 = domingo) e hora da 1ª mensagem do cliente */
  dia_semana?: string;
  hora?: string;
  interesse?: string;
  /** Plataforma do anúncio (ADS Plataforma); "-" = sem anúncio */
  anuncio?: string;
};

/** Limites das faixas de tempo em segundos: até 5 min, 5–15, 15–30, 30–60, 1–2 h, mais de 2 h */
export const FAIXAS_S = [0, 300, 900, 1800, 3600, 7200, Number.POSITIVE_INFINITY];

const SITUACOES: Record<string, SQL> = {
  humano: sql`${atendimentos.precisouHumano}`,
  so_robo: sql`not ${atendimentos.precisouHumano}`,
  sem_humano: sql`${atendimentos.semHumano}`,
  respondido: sql`${atendimentos.precisouHumano} and not ${atendimentos.semHumano}`,
  ate30: sql`${atendimentos.atendidoAte30} = true`,
  acima30: sql`${atendimentos.atendidoAte30} = false`,
  demorou30: sql`${atendimentos.tempoAteHumanoS} > 1800`,
  esperou30: sql`${atendimentos.esperasAcima30} > 0`,
  sem_resposta: sql`${atendimentos.semResposta} > 0`,
  transferido: sql`${atendimentos.transferencias} > 0`,
  fora_horario: sql`${atendimentos.foraHorario}`,
};

function faixa(coluna: typeof atendimentos.tempoAteHumanoS | typeof atendimentos.tempoMedioRespostaS, v?: string): SQL | null {
  const i = Number(v);
  if (v === undefined || v === "" || !Number.isInteger(i) || i < 0 || i > 5) return null;
  const fim = FAIXAS_S[i + 1]!;
  return Number.isFinite(fim) ? sql`${coluna} >= ${FAIXAS_S[i]} and ${coluna} < ${fim}` : sql`${coluna} >= ${FAIXAS_S[i]}`;
}

const ehData = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Condições SQL dos filtros — SEMPRE inclui a empresa */
export function condicoesAtendimentos(empresaId: string, f: FiltroAtendimentos): SQL[] {
  const c: SQL[] = [eq(atendimentos.empresaId, empresaId)];
  if (ehUuid(f.chatbot_id)) c.push(eq(atendimentos.chatbotId, f.chatbot_id));
  if (ehUuid(f.atendente_id)) c.push(eq(atendimentos.atendenteId, f.atendente_id));
  if (ehUuid(f.time_id)) c.push(sql`${atendimentos.atendenteId} in (select id from atendentes where time_id = ${f.time_id})`);
  if (f.origem_id === "nenhuma") c.push(isNull(atendimentos.origemId));
  else if (ehUuid(f.origem_id)) c.push(eq(atendimentos.origemId, f.origem_id));
  if (f.departamento_id === "nenhum") c.push(isNull(atendimentos.departamentoId));
  else if (ehUuid(f.departamento_id)) c.push(eq(atendimentos.departamentoId, f.departamento_id));
  if (ehUuid(f.etiqueta_id))
    c.push(sql`exists (select 1 from atendimento_etiquetas ae where ae.atendimento_id = ${atendimentos.id} and ae.etiqueta_id = ${f.etiqueta_id})`);
  if (ehUuid(f.etiqueta_plataforma))
    c.push(sql`exists (select 1 from etiquetas_plataforma ep where ep.id = ${f.etiqueta_plataforma}
      and ep.chatbot_id = ${atendimentos.chatbotId} and ep.id_externo = any(${atendimentos.etiquetasPlataforma}))`);
  if (f.canal) c.push(sql`lower(coalesce(${atendimentos.canal}, '')) = lower(${f.canal})`);
  if (f.fonte) c.push(sql`lower(coalesce(${atendimentos.fonte}, '')) = lower(${f.fonte})`);
  if (f.cidade) c.push(sql`lower(coalesce(${atendimentos.cidade}, '')) = lower(${f.cidade})`);
  if (f.humano === "1") c.push(eq(atendimentos.precisouHumano, true));
  if (f.novo === "1") c.push(eq(atendimentos.leadNovo, true));
  if (f.novo === "0") c.push(eq(atendimentos.leadNovo, false));
  if (f.situacao && SITUACOES[f.situacao]) c.push(SITUACOES[f.situacao]!);
  const fh = faixa(atendimentos.tempoAteHumanoS, f.faixa_humano);
  if (fh) c.push(fh);
  const fr = faixa(atendimentos.tempoMedioRespostaS, f.faixa_resposta);
  if (fr) c.push(fr);
  const dia = Number(f.dia_semana);
  if (f.dia_semana && Number.isInteger(dia) && dia >= 0 && dia <= 6)
    c.push(sql`extract(dow from ${atendimentos.primeiraMsgClienteEm} at time zone ${env.TZ_RELATORIOS}) = ${dia}`);
  const hora = Number(f.hora);
  if (f.hora && Number.isInteger(hora) && hora >= 0 && hora <= 23)
    c.push(sql`extract(hour from ${atendimentos.primeiraMsgClienteEm} at time zone ${env.TZ_RELATORIOS}) = ${hora}`);
  if (f.anuncio) c.push(sql`lower(coalesce(${atendimentos.anuncioPlataforma}, '')) = lower(${f.anuncio === "-" ? "" : f.anuncio})`);
  if (f.interesse !== undefined && f.interesse !== "") c.push(sql`lower(coalesce(${atendimentos.interesse}, '')) = lower(${f.interesse === "-" ? "" : f.interesse})`);
  if (ehData(f.inicio)) c.push(sql`${atendimentos.inicioEm} >= (${f.inicio}::date::timestamp at time zone ${env.TZ_RELATORIOS})`);
  if (ehData(f.fim)) c.push(sql`${atendimentos.inicioEm} < ((${f.fim}::date + 1)::timestamp at time zone ${env.TZ_RELATORIOS})`);
  const busca = f.busca?.trim();
  if (busca) {
    const termo = `%${busca}%`;
    const digitos = normalizarTelefone(busca);
    c.push(sql`(
      exists (select 1 from contatos ct where ct.id = ${atendimentos.contatoId}
              and (ct.nome ilike ${termo} ${digitos.length >= 4 ? sql`or ct.telefone like ${"%" + digitos + "%"}` : sql``}))
      or ${atendimentos.resumo} ilike ${termo} or ${atendimentos.protocolo} = ${busca}
    )`);
  }
  return c;
}
