import { Elysia } from "elysia";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { semear } from "./db/seed";
import { env } from "./env";
import { rotasAssistente } from "./routes/assistente";
import { rotasAtendentes } from "./routes/atendentes";
import { rotasAtendimentos } from "./routes/atendimentos";
import { rotasAuth } from "./routes/auth";
import { rotasDepartamentos, rotasEtiquetas, rotasOrigens, rotasTimes } from "./routes/cadastros";
import { rotasChatbots } from "./routes/chatbots";
import { rotasDashboard } from "./routes/dashboard";
import { rotasEmpresas } from "./routes/empresas";
import { rotasEventos } from "./routes/eventos";
import { rotasRegras } from "./routes/regras";
import { rotasUsuarios } from "./routes/usuarios";
import { rotasWebhook } from "./routes/webhook";
import { iniciarOrganizador, pararOrganizador } from "./services/organizador";

// Migrações + superadmin inicial (idempotente)
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
  .use(rotasEmpresas)
  .use(rotasUsuarios)
  .use(rotasChatbots)
  .use(rotasAtendentes)
  .use(rotasTimes)
  .use(rotasOrigens)
  .use(rotasDepartamentos)
  .use(rotasEtiquetas)
  .use(rotasRegras)
  .use(rotasAtendimentos)
  .use(rotasDashboard)
  .use(rotasEventos)
  .use(rotasAssistente)
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

await iniciarOrganizador();
console.log(`Painel rodando em http://localhost:${app.server?.port}`);

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    pararOrganizador();
    app.stop();
    process.exit(0);
  });
}
