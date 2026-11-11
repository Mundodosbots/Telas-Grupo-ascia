import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();

export const papelUsuario = pgEnum("papel_usuario", ["master", "gerente"]);

/**
 * pendente     → aguardando o agente
 * processando  → agente trabalhando
 * classificado → agente classificou com confiança suficiente
 * revisar      → agente não achou origem ou ficou inseguro; precisa de um humano
 * erro         → agente falhou várias vezes
 * manual       → um usuário definiu/confirmou (o agente não mexe mais)
 */
export const statusClassificacao = pgEnum("status_classificacao", [
  "pendente",
  "processando",
  "classificado",
  "revisar",
  "erro",
  "manual",
]);

export const statusEvento = pgEnum("status_evento", ["processado", "rejeitado", "duplicado"]);

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  papel: papelUsuario("papel").notNull().default("gerente"),
  ativo: boolean("ativo").notNull().default(true),
  ultimoLoginEm: timestamp("ultimo_login_em", { withTimezone: true }),
  criadoEm: criadoEm(),
});

export const empresas = pgTable("empresas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  slug: text("slug").notNull().unique(),
  cor: text("cor").notNull().default("#2a78d6"),
  /** sha256 do token do webhook — o token em si só é mostrado uma vez */
  tokenHash: text("token_hash").unique(),
  tokenPrefixo: text("token_prefixo"),
  tokenGeradoEm: timestamp("token_gerado_em", { withTimezone: true }),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
});

export const vendedores = pgTable(
  "vendedores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id").notNull().references(() => empresas.id),
    nome: text("nome").notNull(),
    nomeNormalizado: text("nome_normalizado").notNull(),
    /** Nomes alternativos (normalizados) vindos de mesclagens — o bot pode continuar mandando o nome antigo */
    apelidos: text("apelidos").array().notNull().default(sql`'{}'::text[]`),
    idExterno: text("id_externo"),
    email: text("email"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("vendedores_empresa_nome_uq").on(t.empresaId, t.nomeNormalizado),
    uniqueIndex("vendedores_empresa_externo_uq")
      .on(t.empresaId, t.idExterno)
      .where(sql`${t.idExterno} is not null`),
  ],
);

/** Origem do contato (de onde ele veio). empresaId nulo = vale para todas as empresas. */
export const origens = pgTable("origens", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  /** Explicação usada pelo agente para decidir. Quanto mais clara, melhor a classificação. */
  descricao: text("descricao").notNull().default(""),
  cor: text("cor").notNull().default("#898781"),
  empresaId: uuid("empresa_id").references(() => empresas.id),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
});

/** Etiquetas livres (interesse, perfil, situação...). empresaId nulo = todas as empresas. */
export const etiquetas = pgTable("etiquetas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  descricao: text("descricao").notNull().default(""),
  cor: text("cor").notNull().default("#898781"),
  empresaId: uuid("empresa_id").references(() => empresas.id),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
});

export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id").notNull().references(() => empresas.id),
    nome: text("nome").notNull(),
    telefone: text("telefone").notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("clientes_empresa_telefone_uq").on(t.empresaId, t.telefone)],
);

export const webhookEventos = pgTable(
  "webhook_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id").references(() => empresas.id),
    /** "evento_id" enviado pelo bot — evita duplicar quando ele reenviar */
    idExterno: text("id_externo"),
    tipo: text("tipo").notNull().default("atribuicao"),
    payload: jsonb("payload").notNull(),
    status: statusEvento("status").notNull(),
    erro: text("erro"),
    atendimentoId: uuid("atendimento_id"),
    recebidoEm: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_eventos_externo_uq")
      .on(t.empresaId, t.idExterno)
      .where(sql`${t.idExterno} is not null and ${t.status} = 'processado'`),
    index("webhook_eventos_recebido_idx").on(t.recebidoEm),
  ],
);

export const atendimentos = pgTable(
  "atendimentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id").notNull().references(() => empresas.id),
    clienteId: uuid("cliente_id").notNull().references(() => clientes.id),
    conversaIdExterno: text("conversa_id_externo"),
    /** Quem fica com a contagem: sempre o último vendedor atribuído */
    vendedorAtualId: uuid("vendedor_atual_id").notNull().references(() => vendedores.id),
    origemId: uuid("origem_id").references(() => origens.id),
    resumo: text("resumo").notNull().default(""),
    fonteInformada: text("fonte_informada"),
    totalAtribuicoes: integer("total_atribuicoes").notNull().default(1),
    primeiraAtribuicaoEm: timestamp("primeira_atribuicao_em", { withTimezone: true }).notNull(),
    ultimaAtribuicaoEm: timestamp("ultima_atribuicao_em", { withTimezone: true }).notNull(),

    classificacaoStatus: statusClassificacao("classificacao_status").notNull().default("pendente"),
    classificacaoConfianca: real("classificacao_confianca"),
    classificacaoJustificativa: text("classificacao_justificativa"),
    /** Quando nenhuma origem cadastrada serve, o agente sugere um nome de nova origem */
    classificacaoSugestao: text("classificacao_sugestao"),
    classificacaoTentativas: integer("classificacao_tentativas").notNull().default(0),
    classificacaoErro: text("classificacao_erro"),
    classificadoEm: timestamp("classificado_em", { withTimezone: true }),
    classificadoPorUsuarioId: uuid("classificado_por_usuario_id").references(() => usuarios.id),

    criadoEm: criadoEm(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("atendimentos_empresa_data_idx").on(t.empresaId, t.ultimaAtribuicaoEm),
    index("atendimentos_vendedor_idx").on(t.vendedorAtualId),
    index("atendimentos_origem_idx").on(t.origemId),
    index("atendimentos_status_idx").on(t.classificacaoStatus),
    index("atendimentos_cliente_idx").on(t.clienteId, t.ultimaAtribuicaoEm),
    uniqueIndex("atendimentos_conversa_uq")
      .on(t.empresaId, t.conversaIdExterno)
      .where(sql`${t.conversaIdExterno} is not null`),
  ],
);

export const atendimentoEtiquetas = pgTable(
  "atendimento_etiquetas",
  {
    atendimentoId: uuid("atendimento_id")
      .notNull()
      .references(() => atendimentos.id, { onDelete: "cascade" }),
    etiquetaId: uuid("etiqueta_id")
      .notNull()
      .references(() => etiquetas.id, { onDelete: "cascade" }),
    criadoEm: criadoEm(),
  },
  (t) => [primaryKey({ columns: [t.atendimentoId, t.etiquetaId] })],
);

/** Linha do tempo: cada vez que o atendimento foi atribuído a alguém */
export const atribuicoes = pgTable(
  "atribuicoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atendimentoId: uuid("atendimento_id")
      .notNull()
      .references(() => atendimentos.id, { onDelete: "cascade" }),
    vendedorId: uuid("vendedor_id").notNull().references(() => vendedores.id),
    resumo: text("resumo").notNull().default(""),
    fonte: text("fonte"),
    dadosExtras: jsonb("dados_extras").notNull().default({}),
    eventoId: uuid("evento_id").references(() => webhookEventos.id),
    atribuidoEm: timestamp("atribuido_em", { withTimezone: true }).notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("atribuicoes_atendimento_idx").on(t.atendimentoId, t.atribuidoEm)],
);

export type Usuario = typeof usuarios.$inferSelect;
export type Empresa = typeof empresas.$inferSelect;
export type Atendimento = typeof atendimentos.$inferSelect;
