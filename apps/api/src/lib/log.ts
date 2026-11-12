import { env } from "../env";

/**
 * Linha de log legível no Portainer (stdout do container):
 * [12/11/2026 08:04:12] WEBHOOK | Evento recebido | Asia Fiat | Alan ... | +5566... | ...
 */
export function registrar(etapa: string, ...partes: (string | null | undefined | false)[]) {
  const quando = new Date().toLocaleString("pt-BR", { timeZone: env.TZ_RELATORIOS });
  console.log(`[${quando}] ${etapa} | ${partes.filter(Boolean).join(" | ")}`);
}

/** Telefone ou, quando o contato não tem número, o ID dele na plataforma */
export const contato = (telefone: string | null | undefined) =>
  !telefone ? "sem telefone" : telefone.startsWith("id:") ? `sem telefone (ID ${telefone.slice(3)})` : telefone;
