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
};

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
  if (f.canal) c.push(sql`lower(coalesce(${atendimentos.canal}, '')) = lower(${f.canal})`);
  if (f.fonte) c.push(sql`lower(coalesce(${atendimentos.fonte}, '')) = lower(${f.fonte})`);
  if (f.cidade) c.push(sql`lower(coalesce(${atendimentos.cidade}, '')) = lower(${f.cidade})`);
  if (f.humano === "1") c.push(eq(atendimentos.precisouHumano, true));
  if (f.novo === "1") c.push(eq(atendimentos.leadNovo, true));
  if (f.novo === "0") c.push(eq(atendimentos.leadNovo, false));
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
