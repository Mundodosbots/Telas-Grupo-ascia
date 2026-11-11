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

export const env = {
  DATABASE_URL: obrigatorio("DATABASE_URL"),
  PORT: numero("PORT", 3000),
  JWT_SECRET: obrigatorio("JWT_SECRET"),
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  TZ_RELATORIOS: process.env.TZ_RELATORIOS || "America/Sao_Paulo",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  AGENTE_CONFIANCA_MINIMA: numero("AGENTE_CONFIANCA_MINIMA", 0.6),
  JANELA_REATRIBUICAO_DIAS: numero("JANELA_REATRIBUICAO_DIAS", 30),
};
