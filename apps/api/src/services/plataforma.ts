/**
 * Leitor do formato da plataforma de chatbot (Mundo dos Bots).
 *
 * A plataforma manda o CONTATO inteiro:
 *   { id, full_name, phone, tags: [{id}], custom_fields: [{id, name, value, type}], ... }
 * Campos personalizados são lidos pelo NOME (sem diferenciar maiúsculas/acentos),
 * então tanto faz a ordem e a quantidade. Etiquetas chegam só com o ID e são
 * traduzidas pelo dicionário da empresa.
 */
import { normalizarNome, normalizarTelefone, texto } from "../lib/util";

/** Nomes dos campos personalizados que o sistema usa (comparados sem maiúsculas/acentos) */
export const CAMPOS = {
  consultor: ["Consultor"],
  resumo: ["Resumo conversa", "resumo"],
  fonte: ["Fonte do contato"],
};

/** Campos que não ajudam a descobrir a origem (pesquisas, mídia, controle interno) */
const CAMPO_IRRELEVANTE = /^\d+_[PV]_|^NPS|survey|pesquisa|^perg\d|^Respondeu|Openai_response|current_year|Anexar|Foto|geolocalizacao|^data atual$|^Agendamento$/i;

export const SEM_CONSULTOR = "Sem consultor";

export type ContatoPlataforma = {
  idExterno?: string;
  nome: string;
  telefone: string;
  consultor?: string;
  resumo: string;
  fonte?: string;
  /** Nomes das etiquetas (ID entre # quando o dicionário não conhece) */
  etiquetas: string[];
  /** Campos preenchidos, por nome, sem o resumo e sem os irrelevantes */
  campos: Record<string, string>;
};

export function ehFormatoPlataforma(p: unknown): p is Record<string, any> {
  return !!p && typeof p === "object" && !Array.isArray(p) && Array.isArray((p as any).custom_fields);
}

function valorDoCampo(campos: any[], nomes: string[]): string | undefined {
  const alvo = new Set(nomes.map(normalizarNome));
  for (const c of campos) {
    if (c && alvo.has(normalizarNome(String(c.name ?? "")))) {
      const v = texto(c.value);
      if (v) return v;
    }
  }
  return undefined;
}

export function lerContato(p: Record<string, any>, dicionario: Map<string, string>): ContatoPlataforma {
  const campos: any[] = p.custom_fields ?? [];
  const nome =
    texto(p.full_name) ?? ([texto(p.first_name), texto(p.last_name)].filter(Boolean).join(" ") || undefined) ?? "Sem nome";

  const etiquetas = (Array.isArray(p.tags) ? p.tags : [])
    .map((t: any) => {
      const id = texto(t?.id);
      const nomeTag = texto(t?.name) ?? (id ? dicionario.get(id) : undefined);
      return nomeTag ?? (id ? `#${id}` : undefined);
    })
    .filter((x: string | undefined): x is string => !!x);

  const usados = new Set([...CAMPOS.resumo, ...CAMPOS.consultor, ...CAMPOS.fonte].map(normalizarNome));
  const extras: Record<string, string> = {};
  for (const c of campos) {
    const n = texto(c?.name);
    const v = texto(c?.value);
    if (!n || !v || usados.has(normalizarNome(n)) || CAMPO_IRRELEVANTE.test(n)) continue;
    extras[n] = v.length > 500 ? v.slice(0, 500) + "…" : v;
  }

  return {
    idExterno: texto(p.id),
    nome,
    telefone: normalizarTelefone(texto(p.phone) ?? ""),
    consultor: valorDoCampo(campos, CAMPOS.consultor),
    resumo: valorDoCampo(campos, CAMPOS.resumo) ?? "",
    fonte: valorDoCampo(campos, CAMPOS.fonte),
    etiquetas,
    campos: extras,
  };
}

/** Extrai a seção "Origem do contato" do resumo (o resumo da plataforma vem em markdown com seções) */
export function secaoOrigem(resumo: string): string | null {
  const secoes = resumo.split(/\n(?=#{1,3} )/);
  const s = secoes.find((x) => /^#{1,3}\s*\d*\.?\s*origem/i.test(x.trim()));
  return s ? s.trim() : null;
}
