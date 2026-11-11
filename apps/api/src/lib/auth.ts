import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "../db/client";
import { usuarios } from "../db/schema";
import { env } from "../env";

export type UsuarioSessao = {
  id: string;
  nome: string;
  email: string;
  papel: "master" | "gerente";
};

export const COOKIE_SESSAO = "sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 24 * 7;

function assinar(dados: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(dados).digest("base64url");
}

/** Token de sessão: base64url({sub,exp}).assinatura */
export function criarTokenSessao(usuarioId: string): string {
  const corpo = Buffer.from(
    JSON.stringify({ sub: usuarioId, exp: Math.floor(Date.now() / 1000) + DURACAO_SESSAO_S }),
  ).toString("base64url");
  return `${corpo}.${assinar(corpo)}`;
}

export function lerTokenSessao(token: string): string | null {
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;
  const esperado = Buffer.from(assinar(corpo));
  const recebido = Buffer.from(assinatura);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(corpo, "base64url").toString());
    if (typeof sub !== "string" || typeof exp !== "number" || exp < Date.now() / 1000) return null;
    return sub;
  } catch {
    return null;
  }
}

export function opcoesCookie() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.COOKIE_SECURE,
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  };
}

export async function usuarioDoCookie(token: unknown): Promise<UsuarioSessao | null> {
  if (typeof token !== "string" || !token) return null;
  const id = lerTokenSessao(token);
  if (!id) return null;
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, id));
  if (!u || !u.ativo) return null;
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel };
}

/**
 * Protege as rotas registradas DEPOIS dele no mesmo módulo.
 * protegido()          → qualquer usuário logado
 * protegido("master")  → só o master
 */
export function protegido(papel?: "master") {
  return new Elysia()
    .derive({ as: "scoped" }, async ({ cookie }) => ({
      usuario: (await usuarioDoCookie(cookie[COOKIE_SESSAO]?.value)) as UsuarioSessao,
    }))
    .onBeforeHandle({ as: "scoped" }, ({ usuario, set }) => {
      if (!usuario) {
        set.status = 401;
        return { erro: "Não autenticado" };
      }
      if (papel === "master" && usuario.papel !== "master") {
        set.status = 403;
        return { erro: "Apenas o usuário master pode fazer isso" };
      }
    });
}
