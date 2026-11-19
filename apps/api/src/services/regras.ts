import { and, asc, eq } from "drizzle-orm";
import type { db as Db } from "../db/client";
import { origens, regrasOrigem } from "../db/schema";
import { normalizarNome } from "../lib/util";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0] | typeof Db;

/** O que as regras podem olhar em um atendimento */
export type EntradaRegras = {
  etiquetas: string[];
  fonte?: string | null;
  canal?: string | null;
  anuncioPlataforma?: string | null;
  /** histórico do atendimento + campos de anúncio */
  texto?: string;
};

export type RegraAplicada = { id: string; origemId: string; descricao: string };

const ROTULO: Record<string, string> = { etiqueta: "etiqueta", fonte: "fonte", canal: "canal", anuncio: "plataforma do anúncio", texto: "texto" };

/** Primeira regra ativa (menor prioridade primeiro) que bate */
export async function aplicarRegras(tx: Tx, empresaId: string, e: EntradaRegras): Promise<RegraAplicada | null> {
  const regras = await tx
    .select({ r: regrasOrigem, origemNome: origens.nome })
    .from(regrasOrigem)
    .innerJoin(origens, eq(origens.id, regrasOrigem.origemId))
    .where(and(eq(regrasOrigem.empresaId, empresaId), eq(regrasOrigem.ativo, true), eq(origens.ativo, true)))
    .orderBy(asc(regrasOrigem.prioridade), asc(regrasOrigem.criadoEm));
  if (!regras.length) return null;

  // Etiqueta sem nome chega como "#706325": a regra também pode usar o número
  const etqs = e.etiquetas.flatMap((x) => (x.startsWith("#") ? [normalizarNome(x), normalizarNome(x.slice(1))] : [normalizarNome(x)]));
  const valores: Record<string, string[]> = {
    etiqueta: etqs,
    fonte: e.fonte ? [normalizarNome(e.fonte)] : [],
    canal: e.canal ? [normalizarNome(e.canal)] : [],
    anuncio: e.anuncioPlataforma ? [normalizarNome(e.anuncioPlataforma)] : [],
  };
  let textoN: string | null = null;
  for (const { r, origemNome } of regras) {
    const v = normalizarNome(r.valor);
    if (!v) continue;
    let ok: boolean;
    if (r.campo === "texto") ok = !!e.texto && (textoN ??= normalizarNome(e.texto)).includes(v);
    else ok = (valores[r.campo] ?? []).some((x) => (r.comparacao === "contem" ? x.includes(v) : x === v));
    if (ok) {
      const comp = r.campo === "texto" || r.comparacao === "contem" ? "contém" : "=";
      return { id: r.id, origemId: r.origemId, descricao: `Regra: ${ROTULO[r.campo] ?? r.campo} ${comp} "${r.valor}" → ${origemNome}` };
    }
  }
  return null;
}
