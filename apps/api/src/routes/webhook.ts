import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db/client";
import { empresas, webhookEventos } from "../db/schema";
import { contato, registrar } from "../lib/log";
import { sha256 } from "../lib/util";
import { acordarAgente } from "../services/classificador";
import { ingerirAtribuicao } from "../services/ingestao";

/**
 * Token da empresa: header Authorization: Bearer, header X-Webhook-Token
 * ou ?token= na URL (para plataformas que não deixam configurar cabeçalhos).
 */
function extrairToken(headers: Record<string, string | undefined>, query: Record<string, string | undefined>): string | null {
  const auth = headers["authorization"];
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return headers["x-webhook-token"]?.trim() || query["token"]?.trim() || null;
}

async function empresaDoToken(token: string | null) {
  if (!token) return null;
  const [empresa] = await db
    .select()
    .from(empresas)
    .where(and(eq(empresas.tokenHash, sha256(token)), eq(empresas.ativo, true)));
  return empresa ?? null;
}

const HEADERS_SECRETOS = new Set(["authorization", "x-webhook-token", "cookie"]);

export const rotasWebhook = new Elysia({ prefix: "/api/webhook" })
  .post("/atribuicao", async ({ headers, query, body, set }) => {
    const token = extrairToken(headers, query);
    if (!token) {
      set.status = 401;
      return { ok: false, erro: "Envie o token no header Authorization: Bearer <token> (ou ?token= na URL)" };
    }
    const empresa = await empresaDoToken(token);
    if (!empresa) {
      set.status = 401;
      return { ok: false, erro: "Token inválido" };
    }

    const r = await ingerirAtribuicao(empresa, body);

    if (r.status === "rejeitado") {
      const p = (body ?? {}) as Record<string, any>;
      registrar("WEBHOOK", "Evento REJEITADO", empresa.nome, p.full_name ?? p.cliente?.nome, contato(p.phone ?? p.cliente?.telefone), `erro: ${r.erro}`);
      set.status = 422;
      return { ok: false, erro: r.erro, evento_id: r.eventoId };
    }
    if (r.status === "duplicado") {
      registrar("WEBHOOK", "Evento duplicado (ignorado)", empresa.nome, `evento ${r.eventoId}`);
      return { ok: true, duplicado: true, evento_id: r.eventoId, atendimento_id: r.atendimentoId };
    }
    const l = r.resumoLog;
    registrar(
      "WEBHOOK",
      "Evento recebido",
      empresa.nome,
      l.cliente,
      contato(l.telefone),
      `consultor: ${l.vendedor}`,
      r.novoAtendimento ? "novo atendimento" : r.reenvio ? "atualização (mesmo consultor)" : "repasse de consultor",
      l.regra ? l.regra.replace(/^Regra: /, "origem pela regra: ") : "origem: IA vai analisar o resumo",
    );
    acordarAgente();
    set.status = 202;
    return {
      ok: true,
      evento_id: r.eventoId,
      atendimento_id: r.atendimentoId,
      novo_atendimento: r.novoAtendimento,
      // true = mesmo consultor de antes: dados atualizados, sem contar repasse
      atualizacao: r.reenvio,
      empresa: empresa.nome,
    };
  })
  /**
   * Captura de teste: aceita QUALQUER formato (JSON, formulário, texto) e só guarda
   * exatamente o que chegou, para ver como a plataforma envia os dados.
   * Não cria atendimento. Aparece em "Eventos recebidos" como "capturado".
   */
  .post(
    "/teste",
    async ({ request, headers, query, set }) => {
      const empresa = await empresaDoToken(extrairToken(headers, query));
      if (!empresa) {
        set.status = 401;
        return { ok: false, erro: "Token ausente ou inválido. Use ?token=<token da empresa> na URL ou o header Authorization: Bearer <token>" };
      }

      const bruto = await request.text();
      const tipoConteudo = headers["content-type"] ?? null;
      let corpo: unknown = bruto;
      let formato = "texto";
      try {
        corpo = JSON.parse(bruto);
        formato = "json";
      } catch {
        if (tipoConteudo?.includes("application/x-www-form-urlencoded")) {
          corpo = Object.fromEntries(new URLSearchParams(bruto));
          formato = "formulario";
        }
      }

      const cabecalhos = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k, HEADERS_SECRETOS.has(k) ? "(oculto)" : v]),
      );
      const { token: _t, ...queryLimpa } = query as Record<string, string>;

      const [ev] = await db
        .insert(webhookEventos)
        .values({
          empresaId: empresa.id,
          tipo: "captura",
          status: "capturado",
          payload: {
            formato,
            tipo_conteudo: tipoConteudo,
            tamanho_bytes: Buffer.byteLength(bruto),
            corpo,
            ...(formato !== "texto" && { corpo_bruto: bruto.length <= 20_000 ? bruto : bruto.slice(0, 20_000) + "…" }),
            parametros_url: queryLimpa,
            cabecalhos,
          },
        })
        .returning({ id: webhookEventos.id });

      const campos = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? Object.keys(corpo) : [];
      set.status = 200;
      return {
        ok: true,
        mensagem: "Recebido e guardado para teste. Veja em Eventos recebidos.",
        evento_id: ev!.id,
        empresa: empresa.nome,
        formato,
        campos_recebidos: campos,
      };
    },
    // Não interpreta o corpo: queremos o texto exato que a plataforma mandou
    { parse: "none" },
  );
