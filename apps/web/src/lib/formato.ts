const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtNumero = new Intl.NumberFormat("pt-BR");

export const dataHora = (iso: string | null | undefined) => (iso ? fmtDataHora.format(new Date(iso)) : "—");
export const data = (iso: string | null | undefined) => (iso ? fmtData.format(new Date(iso)) : "—");
export const numero = (n: number | null | undefined) => fmtNumero.format(n ?? 0);
export const pct = (parte: number, total: number) => (total ? `${Math.round((parte / total) * 100)}%` : "—");

/** "5511999990000" → "+55 (11) 99999-0000" (melhor esforço) */
export function telefone(t: string): string {
  const d = t.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return t;
}

/** Data local YYYY-MM-DD */
export function isoDia(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

export function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDia(d);
}

/** Lista de dias entre inicio e fim (inclusive) — para preencher buracos no gráfico */
export function diasEntre(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const d = new Date(`${inicio}T12:00:00`);
  const f = new Date(`${fim}T12:00:00`);
  while (d <= f && dias.length < 800) {
    dias.push(isoDia(d));
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

export const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Trecho útil do resumo para quem vai revisar: a seção "Origem do contato" (resumo da plataforma)
 * ou, se não houver, o começo do texto. Sem símbolos de markdown.
 */
export function trechoParaRevisao(resumo: string): { titulo: string | null; texto: string } {
  const secoes = resumo.split(/\n(?=#{1,4} )/);
  const origem = secoes.find((s) => /^#{1,4}\s*\d*\.?\s*origem/i.test(s.trim()));
  const limpar = (s: string) =>
    s
      .split("\n")
      .filter((l) => !/^#{1,4}\s/.test(l.trim()))
      .map((l) => l.trim().replace(/^[-*]\s+/, "• ").replace(/\*\*/g, "").replace(/`/g, ""))
      .filter(Boolean)
      .join("\n");
  return origem ? { titulo: "Origem do contato, segundo o resumo", texto: limpar(origem) } : { titulo: null, texto: limpar(resumo) };
}

/** Paleta categórica validada (claro). Ordem fixa: nunca reciclar. */
export const PALETA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948", "#898781"];
