import { and, asc, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import {
  atendimentos,
  atribuicoes,
  clientes,
  dicionarioEtiquetas,
  origens,
  regrasOrigem,
  vendedores,
  webhookEventos,
  type Empresa,
} from "../db/schema";
import { env } from "../env";
import { normalizarNome, normalizarTelefone, parseData, texto } from "../lib/util";
import { agenteAtivo } from "./classificador";
import { ehFormatoPlataforma, lerContato, SEM_CONSULTOR } from "./plataforma";

/**
 * Campos reconhecidos no JSON genérico do webhook. Tudo que não estiver aqui
 * vai para `dados_extras` da atribuição — nada se perde.
 */
const CAMPOS_CONHECIDOS = new Set([
  "evento_id", "conversa_id", "cliente", "cliente_nome", "nome", "cliente_telefone", "telefone",
  "vendedor", "vendedor_nome", "vendedor_id", "vendedor_email", "fonte", "origem", "resumo",
  "data_atribuicao", "atribuido_em", "data", "empresa",
]);

export type DadosAtribuicao = {
  eventoId?: string;
  conversaId?: string;
  clienteIdExterno?: string;
  clienteNome: string;
  clienteTelefone: string;
  vendedorNome: string;
  vendedorIdExterno?: string;
  vendedorEmail?: string;
  fonte?: string;
  resumo: string;
  /** Etiquetas da plataforma (nomes) — usadas pelas regras de origem e pela IA */
  etiquetas: string[];
  /** Campos personalizados relevantes da plataforma */
  campos: Record<string, string>;
  atribuidoEm: Date;
  extras: Record<string, unknown>;
};

export class PayloadInvalido extends Error {}

/** JSON genérico (documentado no README) */
function interpretarGenerico(p: Record<string, any>): DadosAtribuicao {
  const cliente = p.cliente && typeof p.cliente === "object" ? p.cliente : {};
  const vendedor = p.vendedor && typeof p.vendedor === "object" ? p.vendedor : {};

  const telefone = normalizarTelefone(texto(p.cliente_telefone) ?? texto(cliente.telefone) ?? texto(p.telefone) ?? "");
  const vendedorNome =
    (typeof p.vendedor === "string" ? texto(p.vendedor) : undefined) ?? texto(p.vendedor_nome) ?? texto(vendedor.nome);

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
    etiquetas: [],
    campos: {},
    atribuidoEm: parseData(p.data_atribuicao) ?? parseData(p.atribuido_em) ?? parseData(p.data) ?? new Date(),
    extras,
  };
}

/** Formato da plataforma: o contato inteiro com custom_fields e tags */
function interpretarPlataforma(p: Record<string, any>, dicionario: Map<string, string>): DadosAtribuicao {
  const c = lerContato(p, dicionario);
  if (!c.telefone && !c.idExterno) throw new PayloadInvalido("Contato sem telefone (phone) e sem id");
  return {
    clienteIdExterno: c.idExterno,
    clienteNome: c.nome,
    // Sem telefone (ex.: Instagram), usa o ID do contato como identificador
    clienteTelefone: c.telefone || `id:${c.idExterno}`,
    vendedorNome: c.consultor ?? SEM_CONSULTOR,
    fonte: c.fonte,
    resumo: c.resumo,
    etiquetas: c.etiquetas,
    campos: c.campos,
    atribuidoEm: new Date(),
    extras: {
      formato: "plataforma",
      contato: { id: p.id, canal: p.channel, pagina: p.page_id, live_chat: p.live_chat },
      etiquetas: c.etiquetas,
      campos: c.campos,
      ...(!c.consultor && { aviso: "Campo personalizado 'Consultor' vazio" }),
    },
  };
}

export function interpretarPayload(payload: unknown, dicionario = new Map<string, string>()): DadosAtribuicao {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PayloadInvalido("O corpo deve ser um objeto JSON");
  }
  return ehFormatoPlataforma(payload) ? interpretarPlataforma(payload, dicionario) : interpretarGenerico(payload as Record<string, any>);
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

/** Cliente pelo ID do contato na plataforma; se não houver, pelo telefone. Atualiza nome/telefone. */
async function obterCliente(tx: Tx, empresaId: string, d: DadosAtribuicao) {
  const nomeNovo = d.clienteNome === "Sem nome" ? undefined : d.clienteNome;
  if (d.clienteIdExterno) {
    const [porId] = await tx
      .select()
      .from(clientes)
      .where(and(eq(clientes.empresaId, empresaId), eq(clientes.idExterno, d.clienteIdExterno)));
    if (porId) {
      const [ocupado] = await tx
        .select({ id: clientes.id })
        .from(clientes)
        .where(and(eq(clientes.empresaId, empresaId), eq(clientes.telefone, d.clienteTelefone)));
      const [atual] = await tx
        .update(clientes)
        .set({
          ...(nomeNovo && { nome: nomeNovo }),
          ...((!ocupado || ocupado.id === porId.id) && { telefone: d.clienteTelefone }),
          atualizadoEm: new Date(),
        })
        .where(eq(clientes.id, porId.id))
        .returning();
      return atual!;
    }
  }
  const [cliente] = await tx
    .insert(clientes)
    .values({ empresaId, nome: d.clienteNome, telefone: d.clienteTelefone, idExterno: d.clienteIdExterno ?? null })
    .onConflictDoUpdate({
      target: [clientes.empresaId, clientes.telefone],
      set: {
        nome: nomeNovo ?? sql`${clientes.nome}`,
        idExterno: sql`coalesce(${clientes.idExterno}, excluded.id_externo)`,
        atualizadoEm: new Date(),
      },
    })
    .returning();
  return cliente!;
}

export type RegraAplicada = { id: string; origemId: string; descricao: string };

/** Primeira regra ativa (por prioridade) que bate com as etiquetas ou a fonte */
export async function aplicarRegras(tx: Tx | typeof db, empresaId: string, etiquetas: string[], fonte?: string): Promise<RegraAplicada | null> {
  const regras = await tx
    .select({ r: regrasOrigem, origemNome: origens.nome })
    .from(regrasOrigem)
    .innerJoin(origens, eq(origens.id, regrasOrigem.origemId))
    .where(and(eq(regrasOrigem.ativo, true), or(isNull(regrasOrigem.empresaId), eq(regrasOrigem.empresaId, empresaId))))
    .orderBy(asc(regrasOrigem.prioridade), asc(regrasOrigem.criadoEm));

  // Etiqueta sem nome chega como "#706325": a regra também pode ser escrita com o número
  const etqs = etiquetas.flatMap((e) => (e.startsWith("#") ? [normalizarNome(e), normalizarNome(e.slice(1))] : [normalizarNome(e)]));
  const fonteN = fonte ? normalizarNome(fonte) : "";
  for (const { r, origemNome } of regras) {
    const v = normalizarNome(r.valor);
    if (!v) continue;
    const bate = (x: string) => (r.comparacao === "contem" ? x.includes(v) : x === v);
    const ok = r.campo === "fonte" ? !!fonteN && bate(fonteN) : etqs.some(bate);
    if (ok) {
      const onde = r.campo === "fonte" ? "fonte do contato" : "etiqueta";
      return { id: r.id, origemId: r.origemId, descricao: `Regra: ${onde} ${r.comparacao === "contem" ? "contém" : "="} "${r.valor}" → ${origemNome}` };
    }
  }
  return null;
}

export type ResultadoIngestao =
  | {
      status: "processado";
      eventoId: string;
      atendimentoId: string;
      novoAtendimento: boolean;
      reenvio: boolean;
      /** Para o log do container */
      resumoLog: { cliente: string; telefone: string; vendedor: string; regra: string | null };
    }
  | { status: "duplicado"; eventoId: string; atendimentoId: string | null }
  | { status: "rejeitado"; eventoId: string; erro: string };

export async function ingerirAtribuicao(empresa: Empresa, payload: unknown): Promise<ResultadoIngestao> {
  let dados: DadosAtribuicao;
  try {
    const dicionario = ehFormatoPlataforma(payload)
      ? new Map(
          (await db
            .select({ id: dicionarioEtiquetas.idExterno, nome: dicionarioEtiquetas.nome })
            .from(dicionarioEtiquetas)
            .where(eq(dicionarioEtiquetas.empresaId, empresa.id))).map((t) => [t.id, t.nome]),
        )
      : undefined;
    dados = interpretarPayload(payload, dicionario);
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
        sql`select pg_advisory_xact_lock(hashtext(${empresa.id + ":" + (dados.clienteIdExterno ?? dados.clienteTelefone)}))`,
      );

      const vendedor = await obterVendedor(tx, empresa.id, dados);
      const cliente = await obterCliente(tx, empresa.id, dados);
      const regra = await aplicarRegras(tx, empresa.id, dados.etiquetas, dados.fonte);

      const [evento] = await tx
        .insert(webhookEventos)
        .values({
          empresaId: empresa.id,
          idExterno: dados.eventoId ?? null,
          payload: payload as object,
          status: "processado",
        })
        .returning({ id: webhookEventos.id });

      // Atendimento existente? (mesma conversa, ou mesmo cliente dentro da janela)
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
          .where(and(eq(atendimentos.clienteId, cliente.id), gte(atendimentos.ultimaAtribuicaoEm, limite)))
          .orderBy(desc(atendimentos.ultimaAtribuicaoEm))
          .limit(1);
      }

      /** Origem por regra: definida na hora; a IA (se ligada) completa só as etiquetas */
      const camposRegra = (manual: boolean) =>
        manual
          ? {}
          : regra
            ? {
                origemId: regra.origemId,
                origemRegraId: regra.id,
                classificacaoStatus: agenteAtivo() ? ("pendente" as const) : ("classificado" as const),
                classificacaoConfianca: 1,
                classificacaoJustificativa: regra.descricao,
                classificacaoSugestao: null,
                classificacaoTentativas: 0,
                classificacaoErro: null,
                classificadoEm: new Date(),
              }
            : { origemRegraId: null };

      let atendimentoId: string;
      const novoAtendimento = !existente;
      let reenvio = false;

      if (existente) {
        atendimentoId = existente.id;
        const manual = existente.classificacaoStatus === "manual";
        const maisRecente = dados.atribuidoEm >= existente.ultimaAtribuicaoEm;
        // Mesmo consultor de novo = atualização dos dados, não é repasse
        reenvio = vendedor.id === existente.vendedorAtualId;
        const mudouConteudo =
          (dados.resumo && dados.resumo !== existente.resumo) ||
          (dados.fonte ?? null) !== (existente.fonteInformada ?? null) ||
          dados.etiquetas.join("|") !== existente.etiquetasPlataforma.join("|");

        await tx
          .update(atendimentos)
          .set({
            atualizadoEm: new Date(),
            ...(!reenvio && { totalAtribuicoes: sql`${atendimentos.totalAtribuicoes} + 1` }),
            ...(maisRecente && {
              vendedorAtualId: vendedor.id,
              ...(!reenvio && { ultimaAtribuicaoEm: dados.atribuidoEm }),
              ...(dados.resumo && { resumo: dados.resumo }),
              ...(dados.fonte && { fonteInformada: dados.fonte }),
              etiquetasPlataforma: dados.etiquetas,
              camposPlataforma: dados.campos,
            }),
            ...(dados.atribuidoEm < existente.primeiraAtribuicaoEm && { primeiraAtribuicaoEm: dados.atribuidoEm }),
            // Conteúdo novo → reclassifica (a não ser que um humano já tenha classificado)
            ...(maisRecente &&
              mudouConteudo &&
              !manual && {
                classificacaoStatus: "pendente" as const,
                classificacaoTentativas: 0,
                classificacaoErro: null,
              }),
            ...(maisRecente && mudouConteudo && camposRegra(manual)),
          })
          .where(eq(atendimentos.id, existente.id));
      } else {
        const [novo] = await tx
          .insert(atendimentos)
          .values({
            empresaId: empresa.id,
            clienteId: cliente.id,
            conversaIdExterno: dados.conversaId ?? null,
            vendedorAtualId: vendedor.id,
            resumo: dados.resumo,
            fonteInformada: dados.fonte ?? null,
            etiquetasPlataforma: dados.etiquetas,
            camposPlataforma: dados.campos,
            primeiraAtribuicaoEm: dados.atribuidoEm,
            ultimaAtribuicaoEm: dados.atribuidoEm,
            ...camposRegra(false),
          })
          .returning({ id: atendimentos.id });
        atendimentoId = novo!.id;
      }

      // Linha do tempo: só registra quando muda de vendedor (ou é a primeira vez)
      if (!reenvio) {
        await tx.insert(atribuicoes).values({
          atendimentoId,
          vendedorId: vendedor.id,
          resumo: dados.resumo,
          fonte: dados.fonte ?? null,
          dadosExtras: dados.extras,
          eventoId: evento!.id,
          atribuidoEm: dados.atribuidoEm,
        });
      }

      await tx.update(webhookEventos).set({ atendimentoId }).where(eq(webhookEventos.id, evento!.id));

      return {
        status: "processado" as const,
        eventoId: evento!.id,
        atendimentoId,
        novoAtendimento,
        reenvio,
        resumoLog: { cliente: dados.clienteNome, telefone: dados.clienteTelefone, vendedor: vendedor.nome, regra: regra?.descricao ?? null },
      };
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
