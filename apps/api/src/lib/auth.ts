import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "../db/client";
import { empresas, usuarios } from "../db/schema";
import { env } from "../env";
import { ehUuid } from "./util";

export type Papel = "superadmin" | "admin" | "gerente";

export type UsuarioSessao = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  /** nulo para superadmin */
  empresaId: string | null;
  /** Chatbots que o usuário pode ver. Nulo = todos os da empresa (admin e superadmin sempre nulo) */
  chatbotIds: string[] | null;
};

/** O que uma rota de dados pode mostrar: a empresa e, para gerente limitado, só alguns chatbots */
export type Acesso = { empresaId: string; chatbotIds: string[] | null };

export const COOKIE_SESSAO = "sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 24 * 7;
/** Superadmin escolhe em qual empresa está trabalhando por este cabeçalho */
export const CABECALHO_EMPRESA = "x-empresa";

function assinar(dados: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(dados).digest("base64url");
}

/** Token de sessão: base64url({sub,exp}).assinatura */
export function criarTokenSessao(usuarioId: string): string {
  const corpo = Buffer.from(JSON.stringify({ sub: usuarioId, exp: Math.floor(Date.now() / 1000) + DURACAO_SESSAO_S })).toString(
    "base64url",
  );
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
  return { httpOnly: true, sameSite: "lax" as const, secure: env.COOKIE_SECURE, path: "/", maxAge: DURACAO_SESSAO_S };
}

export async function usuarioDoCookie(token: unknown): Promise<UsuarioSessao | null> {
  if (typeof token !== "string" || !token) return null;
  const id = lerTokenSessao(token);
  if (!id) return null;
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, id));
  if (!u || !u.ativo) return null;
  // Empresa desativada bloqueia os usuários dela
  if (u.empresaId) {
    const [e] = await db.select({ id: empresas.id }).from(empresas).where(and(eq(empresas.id, u.empresaId), eq(empresas.ativo, true)));
    if (!e) return null;
  }
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, empresaId: u.empresaId, chatbotIds: u.papel === "gerente" ? (u.chatbotIds ?? null) : null };
}

const NIVEL: Record<Papel, number> = { gerente: 1, admin: 2, superadmin: 3 };

/**
 * Protege as rotas registradas DEPOIS dele no mesmo módulo.
 *   protegido()                         → qualquer usuário logado, sem empresa (ex.: /auth/eu)
 *   protegido({ empresa: true })        → rotas de dados: injeta `empresaId` (a do usuário, ou a escolhida pelo superadmin)
 *                                         e `acesso` (empresa + chatbots que o usuário pode ver)
 *   protegido({ papel: "admin", ... })  → exige administrador da empresa (ou superadmin)
 *   protegido({ papel: "superadmin" })  → só superadmin
 */
export function protegido(opcoes: { papel?: Papel; empresa?: boolean } = {}) {
  return new Elysia()
    .derive({ as: "scoped" }, async ({ cookie, headers }) => {
      const usuario = (await usuarioDoCookie(cookie[COOKIE_SESSAO]?.value)) as UsuarioSessao;
      let empresaId = usuario?.empresaId ?? null;
      if (usuario?.papel === "superadmin") {
        const escolhida = headers[CABECALHO_EMPRESA];
        empresaId = ehUuid(escolhida) ? escolhida : null;
      }
      const acesso: Acesso = { empresaId: empresaId as string, chatbotIds: usuario?.chatbotIds ?? null };
      return { usuario, empresaId: empresaId as string, acesso };
    })
    .onBeforeHandle({ as: "scoped" }, ({ usuario, empresaId, set }) => {
      if (!usuario) {
        set.status = 401;
        return { erro: "Não autenticado" };
      }
      if (opcoes.papel && NIVEL[usuario.papel] < NIVEL[opcoes.papel]) {
        set.status = 403;
        return { erro: opcoes.papel === "superadmin" ? "Apenas o superadmin pode fazer isso" : "Apenas administradores podem fazer isso" };
      }
      if (opcoes.empresa && !empresaId) {
        set.status = 400;
        return { erro: "Escolha uma empresa", codigo: "SEM_EMPRESA" };
      }
    });
}
