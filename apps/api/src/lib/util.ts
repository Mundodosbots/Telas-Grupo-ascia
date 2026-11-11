/** "  JOÃO  da Silva " → "joao da silva" — usado para casar nomes de vendedores */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Mantém só dígitos. "+55 (11) 99999-0000" → "5511999990000" */
export function normalizarTelefone(tel: string): string {
  return tel.replace(/\D/g, "");
}

export function sha256(texto: string): string {
  return new Bun.CryptoHasher("sha256").update(texto).digest("hex");
}

export function gerarTokenWebhook(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "whk_" + Buffer.from(bytes).toString("base64url");
}

export function texto(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

export function parseData(v: unknown): Date | undefined {
  const s = texto(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function ehUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
