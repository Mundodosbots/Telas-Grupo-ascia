CREATE TYPE "public"."papel_usuario" AS ENUM('superadmin', 'admin', 'gerente');--> statement-breakpoint
CREATE TYPE "public"."status_classificacao" AS ENUM('pendente', 'processando', 'classificado', 'erro', 'manual');--> statement-breakpoint
CREATE TYPE "public"."status_evento" AS ENUM('processado', 'rejeitado', 'capturado');--> statement-breakpoint
CREATE TYPE "public"."tipo_remetente" AS ENUM('cliente', 'bot', 'api', 'humano');--> statement-breakpoint
CREATE TABLE "atendentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"apelidos" text[] DEFAULT '{}'::text[] NOT NULL,
	"id_externo" text,
	"email" text,
	"time_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendimento_atendentes" (
	"atendimento_id" uuid NOT NULL,
	"atendente_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"primeira_msg_em" timestamp with time zone NOT NULL,
	"mensagens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "atendimento_atendentes_atendimento_id_atendente_id_pk" PRIMARY KEY("atendimento_id","atendente_id")
);
--> statement-breakpoint
CREATE TABLE "atendimento_etiquetas" (
	"atendimento_id" uuid NOT NULL,
	"etiqueta_id" uuid NOT NULL,
	CONSTRAINT "atendimento_etiquetas_atendimento_id_etiqueta_id_pk" PRIMARY KEY("atendimento_id","etiqueta_id")
);
--> statement-breakpoint
CREATE TABLE "atendimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chatbot_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"protocolo" text,
	"inicio_em" timestamp with time zone NOT NULL,
	"ultima_msg_em" timestamp with time zone NOT NULL,
	"primeira_msg_cliente_em" timestamp with time zone,
	"transferencia_em" timestamp with time zone,
	"primeira_resposta_humana_em" timestamp with time zone,
	"atendente_id" uuid,
	"primeiro_atendente_id" uuid,
	"msgs_cliente" integer DEFAULT 0 NOT NULL,
	"msgs_bot" integer DEFAULT 0 NOT NULL,
	"msgs_api" integer DEFAULT 0 NOT NULL,
	"msgs_humano" integer DEFAULT 0 NOT NULL,
	"tempo_ate_humano_s" integer,
	"tempo_primeira_resposta_s" integer,
	"tempo_medio_resposta_s" integer,
	"tempo_max_resposta_s" integer,
	"respostas_medidas" integer DEFAULT 0 NOT NULL,
	"esperas_acima_30" integer DEFAULT 0 NOT NULL,
	"sem_resposta" integer DEFAULT 0 NOT NULL,
	"precisou_humano" boolean DEFAULT false NOT NULL,
	"sem_humano" boolean DEFAULT false NOT NULL,
	"atendido_ate_30" boolean,
	"duracao_s" integer,
	"transferencias" integer DEFAULT 0 NOT NULL,
	"fora_horario" boolean DEFAULT false NOT NULL,
	"lead_novo" boolean DEFAULT false NOT NULL,
	"fonte" text,
	"canal" text,
	"ref_entrada" text,
	"anuncio_plataforma" text,
	"anuncio" jsonb,
	"origem_id" uuid,
	"origem_regra_id" uuid,
	"departamento_id" uuid,
	"cidade" text,
	"interesse" text,
	"resumo" text,
	"classificacao_status" "status_classificacao" DEFAULT 'pendente' NOT NULL,
	"classificacao_confianca" real,
	"classificacao_justificativa" text,
	"classificacao_tentativas" integer DEFAULT 0 NOT NULL,
	"classificacao_erro" text,
	"classificado_em" timestamp with time zone,
	"classificado_por_usuario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cor" text DEFAULT '#2a78d6' NOT NULL,
	"token_hash" text,
	"token_prefixo" text,
	"token_gerado_em" timestamp with time zone,
	"conta_externa" text,
	"fuso" text DEFAULT 'America/Cuiaba' NOT NULL,
	"horario" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chatbots_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "contatos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chatbot_id" uuid NOT NULL,
	"id_externo" text NOT NULL,
	"nome" text DEFAULT '' NOT NULL,
	"telefone" text,
	"cidade" text,
	"criado_na_plataforma_em" timestamp with time zone,
	"link_conversa" text,
	"etiquetas" text[] DEFAULT '{}'::text[] NOT NULL,
	"campos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"cor" text DEFAULT '#898781' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"slug" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "etiquetas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"cor" text DEFAULT '#898781' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contato_id" uuid NOT NULL,
	"atendimento_id" uuid,
	"enviada_em" timestamp with time zone NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"remetente_tipo" "tipo_remetente" NOT NULL,
	"remetente_nome" text NOT NULL,
	"atendente_id" uuid,
	"texto" text NOT NULL,
	"chave" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "origens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"cor" text DEFAULT '#898781' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras_origem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"campo" text DEFAULT 'etiqueta' NOT NULL,
	"comparacao" text DEFAULT 'igual' NOT NULL,
	"valor" text NOT NULL,
	"origem_id" uuid NOT NULL,
	"prioridade" integer DEFAULT 100 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cor" text DEFAULT '#6250d6' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"papel" "papel_usuario" DEFAULT 'gerente' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ultimo_login_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"chatbot_id" uuid,
	"contato_id" uuid,
	"payload" jsonb NOT NULL,
	"tamanho_bytes" integer DEFAULT 0 NOT NULL,
	"status" "status_evento" NOT NULL,
	"erro" text,
	"resultado" jsonb,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendentes" ADD CONSTRAINT "atendentes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendentes" ADD CONSTRAINT "atendentes_time_id_times_id_fk" FOREIGN KEY ("time_id") REFERENCES "public"."times"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_atendentes" ADD CONSTRAINT "atendimento_atendentes_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_atendentes" ADD CONSTRAINT "atendimento_atendentes_atendente_id_atendentes_id_fk" FOREIGN KEY ("atendente_id") REFERENCES "public"."atendentes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_etiquetas" ADD CONSTRAINT "atendimento_etiquetas_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_etiquetas" ADD CONSTRAINT "atendimento_etiquetas_etiqueta_id_etiquetas_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."etiquetas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_chatbot_id_chatbots_id_fk" FOREIGN KEY ("chatbot_id") REFERENCES "public"."chatbots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_atendente_id_atendentes_id_fk" FOREIGN KEY ("atendente_id") REFERENCES "public"."atendentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_primeiro_atendente_id_atendentes_id_fk" FOREIGN KEY ("primeiro_atendente_id") REFERENCES "public"."atendentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_origem_id_origens_id_fk" FOREIGN KEY ("origem_id") REFERENCES "public"."origens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_origem_regra_id_regras_origem_id_fk" FOREIGN KEY ("origem_regra_id") REFERENCES "public"."regras_origem"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_classificado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("classificado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbots" ADD CONSTRAINT "chatbots_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_chatbot_id_chatbots_id_fk" FOREIGN KEY ("chatbot_id") REFERENCES "public"."chatbots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departamentos" ADD CONSTRAINT "departamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiquetas" ADD CONSTRAINT "etiquetas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_atendente_id_atendentes_id_fk" FOREIGN KEY ("atendente_id") REFERENCES "public"."atendentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "origens" ADD CONSTRAINT "origens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_origem" ADD CONSTRAINT "regras_origem_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_origem" ADD CONSTRAINT "regras_origem_origem_id_origens_id_fk" FOREIGN KEY ("origem_id") REFERENCES "public"."origens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "times" ADD CONSTRAINT "times_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_eventos" ADD CONSTRAINT "webhook_eventos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_eventos" ADD CONSTRAINT "webhook_eventos_chatbot_id_chatbots_id_fk" FOREIGN KEY ("chatbot_id") REFERENCES "public"."chatbots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_eventos" ADD CONSTRAINT "webhook_eventos_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atendentes_empresa_nome_uq" ON "atendentes" USING btree ("empresa_id","nome_normalizado");--> statement-breakpoint
CREATE UNIQUE INDEX "atendentes_empresa_externo_uq" ON "atendentes" USING btree ("empresa_id","id_externo") WHERE "atendentes"."id_externo" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "atendimentos_contato_chave_uq" ON "atendimentos" USING btree ("contato_id","chave");--> statement-breakpoint
CREATE INDEX "atendimentos_empresa_inicio_idx" ON "atendimentos" USING btree ("empresa_id","inicio_em");--> statement-breakpoint
CREATE INDEX "atendimentos_atendente_idx" ON "atendimentos" USING btree ("atendente_id");--> statement-breakpoint
CREATE INDEX "atendimentos_status_idx" ON "atendimentos" USING btree ("classificacao_status");--> statement-breakpoint
CREATE INDEX "chatbots_empresa_idx" ON "chatbots" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contatos_chatbot_externo_uq" ON "contatos" USING btree ("chatbot_id","id_externo");--> statement-breakpoint
CREATE INDEX "contatos_empresa_idx" ON "contatos" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_contato_chave_uq" ON "mensagens" USING btree ("contato_id","chave");--> statement-breakpoint
CREATE INDEX "mensagens_atendimento_idx" ON "mensagens" USING btree ("atendimento_id","enviada_em");--> statement-breakpoint
CREATE UNIQUE INDEX "times_empresa_nome_uq" ON "times" USING btree ("empresa_id","nome");--> statement-breakpoint
CREATE INDEX "usuarios_empresa_idx" ON "usuarios" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "webhook_eventos_empresa_idx" ON "webhook_eventos" USING btree ("empresa_id","recebido_em");