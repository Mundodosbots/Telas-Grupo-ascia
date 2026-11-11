import { eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { atendimentos, statusClassificacao } from "../db/schema";
import { env } from "../env";
import { ehUuid, normalizarTelefone } from "./util";

export type FiltroAtendimentos = {
  empresa_id?: string;
  vendedor_id?: string;
  /** uuid, ou "nenhuma" para atendimentos sem origem */
  origem_id?: string;
  etiqueta_id?: string;
  /** lista separada por vírgula: pendente,revisar,... */
  status?: string;
  /** YYYY-MM-DD (fuso de TZ_RELATORIOS), sobre a data da última atribuição */
  inicio?: string;
  fim?: string;
  busca?: string;
};

const ehData = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const STATUS_VALIDOS = new Set<string>(statusClassificacao.enumValues);

export function condicoesAtendimentos(f: FiltroAtendimentos): SQL[] {
  const c: SQL[] = [];
  if (ehUuid(f.empresa_id)) c.push(eq(atendimentos.empresaId, f.empresa_id));
  if (ehUuid(f.vendedor_id)) c.push(eq(atendimentos.vendedorAtualId, f.vendedor_id));
  if (f.origem_id === "nenhuma") c.push(isNull(atendimentos.origemId));
  else if (ehUuid(f.origem_id)) c.push(eq(atendimentos.origemId, f.origem_id));
  if (ehUuid(f.etiqueta_id)) {
    c.push(
      sql`exists (select 1 from atendimento_etiquetas ae where ae.atendimento_id = ${atendimentos.id} and ae.etiqueta_id = ${f.etiqueta_id})`,
    );
  }
  if (f.status) {
    const lista = f.status.split(",").filter((s) => STATUS_VALIDOS.has(s)) as (typeof statusClassificacao.enumValues)[number][];
    if (lista.length) c.push(inArray(atendimentos.classificacaoStatus, lista));
  }
  if (ehData(f.inicio)) {
    c.push(sql`${atendimentos.ultimaAtribuicaoEm} >= (${f.inicio}::date::timestamp at time zone ${env.TZ_RELATORIOS})`);
  }
  if (ehData(f.fim)) {
    c.push(sql`${atendimentos.ultimaAtribuicaoEm} < ((${f.fim}::date + 1)::timestamp at time zone ${env.TZ_RELATORIOS})`);
  }
  const busca = f.busca?.trim();
  if (busca) {
    const termo = `%${busca}%`;
    const digitos = normalizarTelefone(busca);
    c.push(sql`(
      exists (select 1 from clientes c where c.id = ${atendimentos.clienteId}
              and (c.nome ilike ${termo} ${digitos.length >= 4 ? sql`or c.telefone like ${"%" + digitos + "%"}` : sql``}))
      or ${atendimentos.resumo} ilike ${termo}
    )`);
  }
  return c;
}
