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

/*
 * Painel de Atendimento — SaaS multiempresa
 *
 * Empresa (cliente) → Chatbots (cada um com seu link/token)
 *                   → Contatos → Atendimentos (1 por protocolo) → Mensagens
 * Tudo que é dado de cliente carrega empresa_id: uma empresa nunca vê a outra.
 */

const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () => timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();
const quando = (nome: string) => timestamp(nome, { withTimezone: true });

/** superadmin: dono da plataforma (vê todas as empresas) · admin: administra a própria empresa · gerente: só vê */
export const papelUsuario = pgEnum("papel_usuario", ["superadmin", "admin", "gerente"]);

/**
 * pendente → aguardando o agente · processando → agente trabalhando · classificado → pronto
 * erro → agente falhou várias vezes · manual → um usuário definiu (o agente não mexe mais)
 */
export const statusClassificacao = pgEnum("status_classificacao", ["pendente", "processando", "classificado", "erro", "manual"]);

/** capturado = chegou pelo endpoint de teste: só guardado para inspeção */
export const statusEvento = pgEnum("status_evento", ["processado", "rejeitado", "capturado"]);

/** cliente = contato · bot = automação do fluxo · api = mensagem enviada por integração (Grow, agendamento…) · humano = atendente */
export const tipoRemetente = pgEnum("tipo_remetente", ["cliente", "bot", "api", "humano"]);

export const empresas = pgTable("empresas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  slug: text("slug").notNull().unique(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
});

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** nulo só para superadmin */
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    email: text("email").notNull().unique(),
    senhaHash: text("senha_hash").notNull(),
    papel: papelUsuario("papel").notNull().default("gerente"),
    ativo: boolean("ativo").notNull().default(true),
    ultimoLoginEm: quando("ultimo_login_em"),
    criadoEm: criadoEm(),
  },
  (t) => [index("usuarios_empresa_idx").on(t.empresaId)],
);

/**
 * Horário de atendimento humano por dia da semana (0 = domingo):
 * { "1": [["07:30","11:30"],["13:30","17:30"]], "6": [["07:30","11:30"]] }
 * Dias ausentes = sem atendimento. Objeto vazio = conta 24h.
 */
export type HorarioAtendimento = Record<string, [string, string][]>;

/** Uma conta/bot da plataforma Mundo dos Bots (ex.: Asia Fiat). Cada um tem seu link de webhook. */
export const chatbots = pgTable(
  "chatbots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    cor: text("cor").notNull().default("#2a78d6"),
    /** sha256 do token — o token em si só é mostrado na hora em que é gerado */
    tokenHash: text("token_hash").unique(),
    tokenPrefixo: text("token_prefixo"),
    tokenGeradoEm: quando("token_gerado_em"),
    /** account_id da plataforma, aprendido no 1º envio */
    contaExterna: text("conta_externa"),
    /** Fuso dos horários do histórico (o da conta na plataforma) */
    fuso: text("fuso").notNull().default("America/Cuiaba"),
    horario: jsonb("horario").$type<HorarioAtendimento>().notNull().default({}),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [index("chatbots_empresa_idx").on(t.empresaId)],
);

export const times = pgTable(
  "times",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    cor: text("cor").notNull().default("#6250d6"),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("times_empresa_nome_uq").on(t.empresaId, t.nome)],
);

/**
 * Atendente humano. Chega pelo campo "Atendente"/"Atendente ID" (nome completo + ID)
 * e no histórico só pelo primeiro nome ("OSVALDO"): o primeiro nome faz a ligação.
 */
export const atendentes = pgTable(
  "atendentes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    nomeNormalizado: text("nome_normalizado").notNull(),
    /** Nomes alternativos normalizados (como aparece no histórico, mesclagens) */
    apelidos: text("apelidos").array().notNull().default(sql`'{}'::text[]`),
    idExterno: text("id_externo"),
    email: text("email"),
    timeId: uuid("time_id").references(() => times.id, { onDelete: "set null" }),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("atendentes_empresa_nome_uq").on(t.empresaId, t.nomeNormalizado),
    uniqueIndex("atendentes_empresa_externo_uq")
      .on(t.empresaId, t.idExterno)
      .where(sql`${t.idExterno} is not null`),
  ],
);

/** Cadastros que o agente usa para organizar (cada empresa tem os seus) */
const cadastro = (nomeTabela: string) =>
  pgTable(nomeTabela, {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    /** Explicação usada pelo agente para decidir */
    descricao: text("descricao").notNull().default(""),
    cor: text("cor").notNull().default("#898781"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
  });
export const origens = cadastro("origens");
export const departamentos = cadastro("departamentos");
export const etiquetas = cadastro("etiquetas");

/**
 * Regras fixas de origem, avaliadas antes da IA, em ordem de prioridade (menor primeiro).
 * campo: etiqueta (da plataforma) · fonte · canal · anuncio (ADS Plataforma) · texto (histórico e campos)
 */
export const regrasOrigem = pgTable("regras_origem", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id")
    .notNull()
    .references(() => empresas.id, { onDelete: "cascade" }),
  campo: text("campo").notNull().default("etiqueta"),
  /** igual | contem */
  comparacao: text("comparacao").notNull().default("igual"),
  valor: text("valor").notNull(),
  origemId: uuid("origem_id")
    .notNull()
    .references(() => origens.id, { onDelete: "cascade" }),
  prioridade: integer("prioridade").notNull().default(100),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
});

export const contatos = pgTable(
  "contatos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    chatbotId: uuid("chatbot_id")
      .notNull()
      .references(() => chatbots.id, { onDelete: "cascade" }),
    /** "id" do contato na plataforma */
    idExterno: text("id_externo").notNull(),
    nome: text("nome").notNull().default(""),
    telefone: text("telefone"),
    cidade: text("cidade"),
    criadoNaPlataformaEm: quando("criado_na_plataforma_em"),
    linkConversa: text("link_conversa"),
    /** Nomes das etiquetas da plataforma no último envio */
    etiquetas: text("etiquetas").array().notNull().default(sql`'{}'::text[]`),
    /** Todos os campos personalizados do último envio (exceto os históricos) */
    campos: jsonb("campos").$type<Record<string, string>>().notNull().default({}),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [uniqueIndex("contatos_chatbot_externo_uq").on(t.chatbotId, t.idExterno), index("contatos_empresa_idx").on(t.empresaId)],
);

/** Dados de anúncio do envio (Click-to-WhatsApp / Lead Ads) */
export type DadosAnuncio = {
  titulo?: string;
  texto?: string;
  ctwa?: string;
  link?: string;
  plataforma?: string;
  campanha?: string;
  nome?: string;
  formulario?: string;
};

/**
 * Um atendimento = uma conversa com protocolo (ou um bloco de conversa separado por pausa longa).
 * Os tempos são calculados a partir das mensagens; tempos "úteis" descontam o que ficou fora do horário.
 */
export const atendimentos = pgTable(
  "atendimentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    chatbotId: uuid("chatbot_id")
      .notNull()
      .references(() => chatbots.id, { onDelete: "cascade" }),
    contatoId: uuid("contato_id")
      .notNull()
      .references(() => contatos.id, { onDelete: "cascade" }),
    /** "p:53208" (protocolo) ou "t:<início ISO>" (conversa sem protocolo) */
    chave: text("chave").notNull(),
    protocolo: text("protocolo"),

    inicioEm: quando("inicio_em").notNull(),
    ultimaMsgEm: quando("ultima_msg_em").notNull(),
    primeiraMsgClienteEm: quando("primeira_msg_cliente_em"),
    /** Mensagem do robô de "aguarde… atendentes" / apresentação do consultor */
    transferenciaEm: quando("transferencia_em"),
    primeiraRespostaHumanaEm: quando("primeira_resposta_humana_em"),

    /** Atendente principal (campo Atendente do envio, ou o último humano que falou) */
    atendenteId: uuid("atendente_id").references(() => atendentes.id, { onDelete: "set null" }),
    primeiroAtendenteId: uuid("primeiro_atendente_id").references(() => atendentes.id, { onDelete: "set null" }),

    msgsCliente: integer("msgs_cliente").notNull().default(0),
    msgsBot: integer("msgs_bot").notNull().default(0),
    msgsApi: integer("msgs_api").notNull().default(0),
    msgsHumano: integer("msgs_humano").notNull().default(0),

    /** Segundos (úteis) do robô até o humano */
    tempoAteHumanoS: integer("tempo_ate_humano_s"),
    /** Segundos (úteis) da 1ª mensagem do cliente até a 1ª resposta humana */
    tempoPrimeiraRespostaS: integer("tempo_primeira_resposta_s"),
    tempoMedioRespostaS: integer("tempo_medio_resposta_s"),
    tempoMaxRespostaS: integer("tempo_max_resposta_s"),
    respostasMedidas: integer("respostas_medidas").notNull().default(0),
    esperasAcima30: integer("esperas_acima_30").notNull().default(0),
    /** Mensagens do cliente (com humano na conversa) que ficaram sem resposta */
    semResposta: integer("sem_resposta").notNull().default(0),
    /** Chegou na fila humana (o robô transferiu ou um humano falou); falso = resolvido só pelo robô */
    precisouHumano: boolean("precisou_humano").notNull().default(false),
    /** Foi para a fila e nenhum humano respondeu */
    semHumano: boolean("sem_humano").notNull().default(false),
    atendidoAte30: boolean("atendido_ate_30"),
    /** Segundos corridos da 1ª mensagem do cliente até a última mensagem */
    duracaoS: integer("duracao_s"),
    /** Quantas vezes passou de um humano para outro */
    transferencias: integer("transferencias").notNull().default(0),
    /** Cliente chegou fora do horário de atendimento */
    foraHorario: boolean("fora_horario").notNull().default(false),
    leadNovo: boolean("lead_novo").notNull().default(false),

    fonte: text("fonte"),
    canal: text("canal"),
    refEntrada: text("ref_entrada"),
    anuncioPlataforma: text("anuncio_plataforma"),
    anuncio: jsonb("anuncio").$type<DadosAnuncio>(),

    origemId: uuid("origem_id").references(() => origens.id, { onDelete: "set null" }),
    origemRegraId: uuid("origem_regra_id").references(() => regrasOrigem.id, { onDelete: "set null" }),
    departamentoId: uuid("departamento_id").references(() => departamentos.id, { onDelete: "set null" }),
    cidade: text("cidade"),
    interesse: text("interesse"),
    resumo: text("resumo"),

    classificacaoStatus: statusClassificacao("classificacao_status").notNull().default("pendente"),
    classificacaoConfianca: real("classificacao_confianca"),
    classificacaoJustificativa: text("classificacao_justificativa"),
    classificacaoTentativas: integer("classificacao_tentativas").notNull().default(0),
    classificacaoErro: text("classificacao_erro"),
    classificadoEm: quando("classificado_em"),
    classificadoPorUsuarioId: uuid("classificado_por_usuario_id").references(() => usuarios.id, { onDelete: "set null" }),

    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("atendimentos_contato_chave_uq").on(t.contatoId, t.chave),
    index("atendimentos_empresa_inicio_idx").on(t.empresaId, t.inicioEm),
    index("atendimentos_atendente_idx").on(t.atendenteId),
    index("atendimentos_status_idx").on(t.classificacaoStatus),
  ],
);

/** Humanos que falaram em cada atendimento, na ordem (base das transferências) */
export const atendimentoAtendentes = pgTable(
  "atendimento_atendentes",
  {
    atendimentoId: uuid("atendimento_id")
      .notNull()
      .references(() => atendimentos.id, { onDelete: "cascade" }),
    atendenteId: uuid("atendente_id")
      .notNull()
      .references(() => atendentes.id, { onDelete: "cascade" }),
    ordem: integer("ordem").notNull(),
    primeiraMsgEm: quando("primeira_msg_em").notNull(),
    mensagens: integer("mensagens").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.atendimentoId, t.atendenteId] })],
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
  },
  (t) => [primaryKey({ columns: [t.atendimentoId, t.etiquetaId] })],
);

export const mensagens = pgTable(
  "mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contatoId: uuid("contato_id")
      .notNull()
      .references(() => contatos.id, { onDelete: "cascade" }),
    atendimentoId: uuid("atendimento_id").references(() => atendimentos.id, { onDelete: "set null" }),
    enviadaEm: quando("enviada_em").notNull(),
    /** Posição dentro do mesmo minuto (o histórico só tem minutos) */
    seq: integer("seq").notNull().default(0),
    remetenteTipo: tipoRemetente("remetente_tipo").notNull(),
    remetenteNome: text("remetente_nome").notNull(),
    atendenteId: uuid("atendente_id").references(() => atendentes.id, { onDelete: "set null" }),
    texto: text("texto").notNull(),
    /** Identidade da mensagem para não duplicar quando o histórico chega de novo */
    chave: text("chave").notNull(),
  },
  (t) => [
    uniqueIndex("mensagens_contato_chave_uq").on(t.contatoId, t.chave),
    index("mensagens_atendimento_idx").on(t.atendimentoId, t.enviadaEm),
  ],
);

export const webhookEventos = pgTable(
  "webhook_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "cascade" }),
    chatbotId: uuid("chatbot_id").references(() => chatbots.id, { onDelete: "set null" }),
    contatoId: uuid("contato_id").references(() => contatos.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull(),
    tamanhoBytes: integer("tamanho_bytes").notNull().default(0),
    status: statusEvento("status").notNull(),
    erro: text("erro"),
    /** Resumo do que o envio gerou: atendimentos novos/atualizados, mensagens novas */
    resultado: jsonb("resultado"),
    recebidoEm: quando("recebido_em").notNull().defaultNow(),
  },
  (t) => [index("webhook_eventos_empresa_idx").on(t.empresaId, t.recebidoEm)],
);

export type Usuario = typeof usuarios.$inferSelect;
export type Empresa = typeof empresas.$inferSelect;
export type Chatbot = typeof chatbots.$inferSelect;
export type Atendimento = typeof atendimentos.$inferSelect;
export type Atendente = typeof atendentes.$inferSelect;
