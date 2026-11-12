import { Elysia } from "elysia";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db/client";
import { atendimentos, origens } from "./db/schema";
import { semear } from "./db/seed";
import { env } from "./env";
import { rotasAtendimentos } from "./routes/atendimentos";
import { rotasAuth } from "./routes/auth";
import { rotasEtiquetas, rotasOrigens } from "./routes/cadastros";
import { rotasDashboard } from "./routes/dashboard";
import { rotasEmpresas } from "./routes/empresas";
import { rotasEventos } from "./routes/eventos";
import { reaplicarRegras, rotasDicionario, rotasRegras } from "./routes/regras";
import { rotasUsuarios } from "./routes/usuarios";
import { rotasVendedores } from "./routes/vendedores";
import { rotasWebhook } from "./routes/webhook";
import { iniciarAgente, ORIGEM_SEM_EVIDENCIA, pararAgente } from "./services/classificador";

// Migrações + dados iniciais (idempotente: só cria o que falta)
await semear();

const PASTA_WEB = join(import.meta.dir, "../public");
const temWeb = existsSync(join(PASTA_WEB, "index.html"));

const app = new Elysia()
  .onError(({ code, error, set, path }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return { erro: "Dados inválidos", detalhes: error.all?.map((e: any) => `${e.path || "/"} ${e.message}`) };
    }
    if (code === "PARSE") {
      set.status = 400;
      return { erro: "JSON inválido no corpo da requisição" };
    }
    if (code === "NOT_FOUND" && path.startsWith("/api")) {
      set.status = 404;
      return { erro: "Rota não encontrada" };
    }
    if (code === "NOT_FOUND") return;
    console.error(`[${code}] ${path}:`, error);
    set.status = 500;
    return { erro: "Erro interno" };
  })
  .get("/api/saude", () => ({ ok: true }))
  .use(rotasWebhook)
  .use(rotasAuth)
  .use(rotasUsuarios)
  .use(rotasEmpresas)
  .use(rotasVendedores)
  .use(rotasOrigens)
  .use(rotasEtiquetas)
  .use(rotasAtendimentos)
  .use(rotasDashboard)
  .use(rotasEventos)
  .use(rotasRegras)
  .use(rotasDicionario)
  // Front-end (SPA) compilado em ../public — qualquer rota que não seja /api cai no index.html
  .get("/*", ({ params, set }) => {
    const caminho = String(params["*"] ?? "");
    if (caminho.startsWith("api/")) {
      set.status = 404;
      return { erro: "Rota não encontrada" };
    }
    if (!temWeb) return new Response("Front-end não compilado. Rode `bun run build`.", { status: 503 });
    const alvo = normalize(join(PASTA_WEB, caminho));
    if (alvo.startsWith(PASTA_WEB) && caminho && existsSync(alvo) && !alvo.endsWith(PASTA_WEB)) {
      if (caminho.startsWith("assets/")) set.headers["cache-control"] = "public, max-age=31536000, immutable";
      return Bun.file(alvo);
    }
    set.headers["cache-control"] = "no-cache";
    return Bun.file(join(PASTA_WEB, "index.html"));
  })
  .listen(env.PORT);

await iniciarAgente();

// Atendimentos que chegaram com etiquetas só em número (#ID) ganham o nome e as regras de novo
const [{ pendentes }] = (await db
  .select({ pendentes: sql<number>`count(*)::int` })
  .from(atendimentos)
  .where(sql`${atendimentos.classificacaoStatus} <> 'manual' and exists (select 1 from unnest(${atendimentos.etiquetasPlataforma}) e where e like '#%')`)) as [
  { pendentes: number },
];
if (pendentes) console.log("Etiquetas sem nome reavaliadas:", await reaplicarRegras());

// "A revisar" fica só para falhas: o que a IA tinha deixado em dúvida passa a valer como classificado
// (sem origem → contato direto). Roda a cada início, mas só mexe em quem ainda está em "revisar".
const [padrao] = await db
  .select({ id: origens.id })
  .from(origens)
  .where(and(eq(origens.nome, ORIGEM_SEM_EVIDENCIA), isNull(origens.empresaId)));
if (padrao) {
  const movidos = await db
    .update(atendimentos)
    .set({
      origemId: sql`coalesce(${atendimentos.origemId}, ${padrao.id}::uuid)`,
      classificacaoStatus: "classificado",
      classificacaoJustificativa: sql`case when ${atendimentos.origemId} is null
        then ${`Sem evidência de origem no resumo: considerado ${ORIGEM_SEM_EVIDENCIA}. `} || coalesce(${atendimentos.classificacaoJustificativa}, '')
        else ${atendimentos.classificacaoJustificativa} end`,
    })
    .where(eq(atendimentos.classificacaoStatus, "revisar"))
    .returning({ id: atendimentos.id });
  if (movidos.length) console.log(`Saíram de "A revisar" pela regra nova: ${movidos.length}`);
}

console.log(`Painel rodando em http://localhost:${app.server?.port}`);

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    pararAgente();
    app.stop();
    process.exit(0);
  });
}
