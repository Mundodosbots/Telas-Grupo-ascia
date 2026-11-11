function obrigatorio(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ${nome} não definida (veja .env.example)`);
  return v;
}

function numero(nome: string, padrao: number): number {
  const v = process.env[nome];
  if (!v) return padrao;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Variável ${nome} deve ser numérica`);
  return n;
}

/**
 * Aceita DATABASE_URL pronta ou as partes POSTGRES_* (como nas stacks do Portainer).
 * Montando aqui, senhas com caracteres especiais não quebram a URL.
 */
function urlBanco(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.POSTGRES_HOST;
  if (!host) throw new Error("Defina DATABASE_URL ou POSTGRES_HOST/POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB (veja .env.example)");
  const usuario = encodeURIComponent(obrigatorio("POSTGRES_USER"));
  const senha = encodeURIComponent(obrigatorio("POSTGRES_PASSWORD"));
  const banco = encodeURIComponent(obrigatorio("POSTGRES_DB"));
  return `postgres://${usuario}:${senha}@${host}:${process.env.POSTGRES_PORT || "5432"}/${banco}`;
}

function segredo(nome: string): string {
  const v = obrigatorio(nome);
  if (v.length < 32) throw new Error(`${nome} precisa ter pelo menos 32 caracteres`);
  return v;
}

export const env = {
  DATABASE_URL: urlBanco(),
  PORT: numero("PORT", 3000),
  JWT_SECRET: segredo("JWT_SECRET"),
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  TZ_RELATORIOS: process.env.TZ_RELATORIOS || "America/Sao_Paulo",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  AGENTE_CONFIANCA_MINIMA: numero("AGENTE_CONFIANCA_MINIMA", 0.6),
  JANELA_REATRIBUICAO_DIAS: numero("JANELA_REATRIBUICAO_DIAS", 30),
};
