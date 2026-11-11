import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import {
  atendimentos,
  atribuicoes,
  clientes,
  vendedores,
  webhookEventos,
  type Empresa,
} from "../db/schema";
import { env } from "../env";
import { normalizarNome, normalizarTelefone, parseData, texto } from "../lib/util";

/**
 * Campos reconhecidos no JSON do webhook. Tudo que não estiver aqui
 * vai para `dados_extras` da atribuição — nada se perde.
 * Aceita alguns apelidos para facilitar mudanças no bot.
 */
const CAMPOS_CONHECIDOS = new Set([
  "evento_id", "conversa_id", "cliente", "cliente_nome", "nome", "cliente_telefone", "telefone",
  "vendedor", "vendedor_nome", "vendedor_id", "vendedor_email", "fonte", "origem", "resumo",
  "data_atribuicao", "atribuido_em", "data", "empresa",
]);

export type DadosAtribuicao = {
  eventoId?: string;
  conversaId?: string;
  clienteNome: string;
  clienteTelefone: string;
  vendedorNome: string;
  vendedorIdExterno?: string;
  vendedorEmail?: string;
  fonte?: string;
  resumo: string;
  atribuidoEm: Date;
  extras: Record<string, unknown>;
};

export class PayloadInvalido extends Error {}

export function interpretarPayload(payload: unknown): DadosAtribuicao {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PayloadInvalido("O corpo deve ser um objeto JSON");
  }
  const p = payload as Record<string, any>;
  const cliente = p.cliente && typeof p.cliente === "object" ? p.cliente : {};
  const vendedor = p.vendedor && typeof p.vendedor === "object" ? p.vendedor : {};

  const telefone = normalizarTelefone(
    texto(p.cliente_telefone) ?? texto(cliente.telefone) ?? texto(p.telefone) ?? "",
  );
  const vendedorNome =
    (typeof p.vendedor === "string" ? texto(p.vendedor) : undefined) ??
    texto(p.vendedor_nome) ??
    texto(vendedor.nome);

  const faltando: string[] = [];
  if (!telefone) faltando.push("cliente_telefone");
  if (!vendedorNome) faltando.push("vendedor");
  if (faltando.length) throw new PayloadInvalido(`Campos obrigatórios ausentes: ${faltando.join(", ")}`);

  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (!CAMPOS_CONHECIDOS.has(k)) extras[k] = v;

  return {
    eventoId: texto(p.evento_id),
    conversaId: texto(p.conversa_id),
    clienteNome: texto(p.cliente_nome) ?? texto(cliente.nome) ?? texto(p.nome) ?? "Sem nome",
    clienteTelefone: telefone,
    vendedorNome: vendedorNome!,
    vendedorIdExterno: texto(p.vendedor_id) ?? texto(vendedor.id),
    vendedorEmail: texto(p.vendedor_email) ?? texto(vendedor.email),
    fonte: texto(p.fonte) ?? texto(p.origem),
    resumo: texto(p.resumo) ?? "",
    atribuidoEm: parseData(p.data_atribuicao) ?? parseData(p.atribuido_em) ?? parseData(p.data) ?? new Date(),
    extras,
  };
}

async function obterVendedor(tx: Tx, empresaId: string, d: DadosAtribuicao) {
  const nomeNormalizado = normalizarNome(d.vendedorNome);

  if (d.vendedorIdExterno) {
    const [porId] = await tx
      .select()
      .from(vendedores)
      .where(and(eq(vendedores.empresaId, empresaId), eq(vendedores.idExterno, d.vendedorIdExterno)));
    if (porId) return porId;
  }

  const [porNome] = await tx
    .select()
    .from(vendedores)
    .where(
      and(
        eq(vendedores.empresaId, empresaId),
        or(eq(vendedores.nomeNormalizado, nomeNormalizado), sql`${nomeNormalizado} = any(${vendedores.apelidos})`),
      ),
    )
    .limit(1);
  if (porNome) {
    if (d.vendedorIdExterno && !porNome.idExterno) {
      await tx.update(vendedores).set({ idExterno: d.vendedorIdExterno }).where(eq(vendedores.id, porNome.id));
    }
    return porNome;
  }

  // Vendedor novo: cadastra automaticamente na empresa do token
  const [novo] = await tx
    .insert(vendedores)
    .values({
      empresaId,
      nome: d.vendedorNome,
      nomeNormalizado,
      idExterno: d.vendedorIdExterno ?? null,
      email: d.vendedorEmail ?? null,
    })
    .returning();
  return novo!;
}

export type ResultadoIngestao =
  | { status: "processado"; eventoId: string; atendimentoId: string; novoAtendimento: boolean }
  | { status: "duplicado"; eventoId: string; atendimentoId: string | null }
  | { status: "rejeitado"; eventoId: string; erro: string };

export async function ingerirAtribuicao(empresa: Empresa, payload: unknown): Promise<ResultadoIngestao> {
  let dados: DadosAtribuicao;
  try {
    dados = interpretarPayload(payload);
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    const [ev] = await db
      .insert(webhookEventos)
      .values({ empresaId: empresa.id, payload: payload ?? {}, status: "rejeitado", erro })
      .returning({ id: webhookEventos.id });
    return { status: "rejeitado", eventoId: ev!.id, erro };
  }

  // Reenvio do mesmo evento pelo bot → não duplica
  if (dados.eventoId) {
    const [anterior] = await db
      .select({ id: webhookEventos.id, atendimentoId: webhookEventos.atendimentoId })
      .from(webhookEventos)
      .where(
        and(
          eq(webhookEventos.empresaId, empresa.id),
          eq(webhookEventos.idExterno, dados.eventoId),
          eq(webhookEventos.status, "processado"),
        ),
      );
    if (anterior) {
      const [ev] = await db
        .insert(webhookEventos)
        .values({
          empresaId: empresa.id,
          idExterno: dados.eventoId,
          payload: payload as object,
          status: "duplicado",
          atendimentoId: anterior.atendimentoId,
        })
        .returning({ id: webhookEventos.id });
      return { status: "duplicado", eventoId: ev!.id, atendimentoId: anterior.atendimentoId };
    }
  }

  try {
    return await db.transaction(async (tx) => {
      // Serializa eventos do mesmo cliente para não criar dois atendimentos em paralelo
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${empresa.id + ":" + dados.clienteTelefone}))`,
      );

      const vendedor = await obterVendedor(tx, empresa.id, dados);

      const [cliente] = await tx
        .insert(clientes)
        .values({ empresaId: empresa.id, nome: dados.clienteNome, telefone: dados.clienteTelefone })
        .onConflictDoUpdate({
          target: [clientes.empresaId, clientes.telefone],
          set: {
            nome: dados.clienteNome === "Sem nome" ? sql`${clientes.nome}` : dados.clienteNome,
            atualizadoEm: new Date(),
          },
        })
        .returning();

      const [evento] = await tx
        .insert(webhookEventos)
        .values({
          empresaId: empresa.id,
          idExterno: dados.eventoId ?? null,
          payload: payload as object,
          status: "processado",
        })
        .returning({ id: webhookEventos.id });

      // Atendimento existente? (mesma conversa, ou mesmo telefone dentro da janela)
      let existente;
      if (dados.conversaId) {
        [existente] = await tx
          .select()
          .from(atendimentos)
          .where(and(eq(atendimentos.empresaId, empresa.id), eq(atendimentos.conversaIdExterno, dados.conversaId)));
      } else {
        const limite = new Date(dados.atribuidoEm.getTime() - env.JANELA_REATRIBUICAO_DIAS * 86_400_000);
        [existente] = await tx
          .select()
          .from(atendimentos)
          .where(
            and(
              eq(atendimentos.clienteId, cliente!.id),
              gte(atendimentos.ultimaAtribuicaoEm, limite),
            ),
          )
          .orderBy(desc(atendimentos.ultimaAtribuicaoEm))
          .limit(1);
      }

      let atendimentoId: string;
      const novoAtendimento = !existente;

      if (existente) {
        atendimentoId = existente.id;
        // Evento fora de ordem (mais antigo que o último) só entra na linha do tempo
        const maisRecente = dados.atribuidoEm >= existente.ultimaAtribuicaoEm;
        await tx
          .update(atendimentos)
          .set({
            totalAtribuicoes: sql`${atendimentos.totalAtribuicoes} + 1`,
            atualizadoEm: new Date(),
            ...(maisRecente && {
              vendedorAtualId: vendedor.id,
              ultimaAtribuicaoEm: dados.atribuidoEm,
              ...(dados.resumo && { resumo: dados.resumo }),
              ...(dados.fonte && { fonteInformada: dados.fonte }),
            }),
            ...(dados.atribuidoEm < existente.primeiraAtribuicaoEm && { primeiraAtribuicaoEm: dados.atribuidoEm }),
            // Com resumo novo, o agente reavalia — a não ser que um humano já tenha classificado
            ...(maisRecente &&
              dados.resumo &&
              existente.classificacaoStatus !== "manual" && {
                classificacaoStatus: "pendente" as const,
                classificacaoTentativas: 0,
                classificacaoErro: null,
              }),
          })
          .where(eq(atendimentos.id, existente.id));
      } else {
        const [novo] = await tx
          .insert(atendimentos)
          .values({
            empresaId: empresa.id,
            clienteId: cliente!.id,
            conversaIdExterno: dados.conversaId ?? null,
            vendedorAtualId: vendedor.id,
            resumo: dados.resumo,
            fonteInformada: dados.fonte ?? null,
            primeiraAtribuicaoEm: dados.atribuidoEm,
            ultimaAtribuicaoEm: dados.atribuidoEm,
          })
          .returning({ id: atendimentos.id });
        atendimentoId = novo!.id;
      }

      await tx.insert(atribuicoes).values({
        atendimentoId,
        vendedorId: vendedor.id,
        resumo: dados.resumo,
        fonte: dados.fonte ?? null,
        dadosExtras: dados.extras,
        eventoId: evento!.id,
        atribuidoEm: dados.atribuidoEm,
      });

      await tx.update(webhookEventos).set({ atendimentoId }).where(eq(webhookEventos.id, evento!.id));

      return { status: "processado" as const, eventoId: evento!.id, atendimentoId, novoAtendimento };
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("Falha ao processar webhook:", e);
    const [ev] = await db
      .insert(webhookEventos)
      .values({ empresaId: empresa.id, idExterno: null, payload: payload as object, status: "rejeitado", erro })
      .returning({ id: webhookEventos.id });
    return { status: "rejeitado", eventoId: ev!.id, erro: "Erro interno ao processar o evento" };
  }
}
