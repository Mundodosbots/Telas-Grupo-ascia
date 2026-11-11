import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { usuarios } from "../db/schema";
import { COOKIE_SESSAO, criarTokenSessao, opcoesCookie, protegido } from "../lib/auth";

// Limite simples contra força bruta: 8 erros por e-mail a cada 15 min
const falhas = new Map<string, { n: number; ate: number }>();
const JANELA_MS = 15 * 60 * 1000;

export const rotasAuth = new Elysia({ prefix: "/api/auth" })
  .post(
    "/login",
    async ({ body, cookie, set }) => {
      const email = body.email.toLowerCase().trim();
      const f = falhas.get(email);
      if (f && f.ate > Date.now() && f.n >= 8) {
        set.status = 429;
        return { erro: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
      }

      const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email));
      const ok = u && u.ativo && (await Bun.password.verify(body.senha, u.senhaHash));
      if (!ok) {
        const atual = f && f.ate > Date.now() ? f : { n: 0, ate: Date.now() + JANELA_MS };
        falhas.set(email, { n: atual.n + 1, ate: atual.ate });
        set.status = 401;
        return { erro: "E-mail ou senha incorretos" };
      }
      falhas.delete(email);

      await db.update(usuarios).set({ ultimoLoginEm: new Date() }).where(eq(usuarios.id, u.id));
      cookie[COOKIE_SESSAO]!.set({ value: criarTokenSessao(u.id), ...opcoesCookie() });
      return { usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel } };
    },
    { body: t.Object({ email: t.String(), senha: t.String() }) },
  )
  .post("/logout", ({ cookie }) => {
    cookie[COOKIE_SESSAO]!.set({ value: "", ...opcoesCookie(), maxAge: 0 });
    return { ok: true };
  })
  .use(protegido())
  .get("/eu", ({ usuario }) => ({ usuario }))
  .post(
    "/senha",
    async ({ usuario, body, set }) => {
      const [u] = await db.select().from(usuarios).where(eq(usuarios.id, usuario.id));
      if (!u || !(await Bun.password.verify(body.senha_atual, u.senhaHash))) {
        set.status = 400;
        return { erro: "Senha atual incorreta" };
      }
      await db
        .update(usuarios)
        .set({ senhaHash: await Bun.password.hash(body.nova_senha) })
        .where(eq(usuarios.id, usuario.id));
      return { ok: true };
    },
    { body: t.Object({ senha_atual: t.String(), nova_senha: t.String({ minLength: 8 }) }) },
  );
