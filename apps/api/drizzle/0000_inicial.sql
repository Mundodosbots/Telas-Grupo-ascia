CREATE TYPE "public"."papel_usuario" AS ENUM('master', 'gerente');--> statement-breakpoint
CREATE TYPE "public"."status_classificacao" AS ENUM('pendente', 'processando', 'classificado', 'revisar', 'erro', 'manual');--> statement-breakpoint
CREATE TYPE "public"."status_evento" AS ENUM('processado', 'rejeitado', 'duplicado');--> statement-breakpoint
CREATE TABLE "atendimento_etiquetas" (
	"atendimento_id" uuid NOT NULL,
	"etiqueta_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atendimento_etiquetas_atendimento_id_etiqueta_id_pk" PRIMARY KEY("atendimento_id","etiqueta_id")
);
--> statement-breakpoint
CREATE TABLE "atendimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"conversa_id_externo" text,
	"vendedor_atual_id" uuid NOT NULL,
	"origem_id" uuid,
	"resumo" text DEFAULT '' NOT NULL,
	"fonte_informada" text,
	"total_atribuicoes" integer DEFAULT 1 NOT NULL,
	"primeira_atribuicao_em" timestamp with time zone NOT NULL,
	"ultima_atribuicao_em" timestamp with time zone NOT NULL,
	"classificacao_status" "status_classificacao" DEFAULT 'pendente' NOT NULL,
	"classificacao_confianca" real,
	"classificacao_justificativa" text,
	"classificacao_sugestao" text,
	"classificacao_tentativas" integer DEFAULT 0 NOT NULL,
	"classificacao_erro" text,
	"classificado_em" timestamp with time zone,
	"classificado_por_usuario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atribuicoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"resumo" text DEFAULT '' NOT NULL,
	"fonte" text,
	"dados_extras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evento_id" uuid,
	"atribuido_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"telefone" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"slug" text NOT NULL,
	"cor" text DEFAULT '#2a78d6' NOT NULL,
	"token_hash" text,
	"token_prefixo" text,
	"token_gerado_em" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_slug_unique" UNIQUE("slug"),
	CONSTRAINT "empresas_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "etiquetas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"cor" text DEFAULT '#898781' NOT NULL,
	"empresa_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "origens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"cor" text DEFAULT '#898781' NOT NULL,
	"empresa_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE TABLE "vendedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"apelidos" text[] DEFAULT '{}'::text[] NOT NULL,
	"id_externo" text,
	"email" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"id_externo" text,
	"tipo" text DEFAULT 'atribuicao' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "status_evento" NOT NULL,
	"erro" text,
	"atendimento_id" uuid,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimento_etiquetas" ADD CONSTRAINT "atendimento_etiquetas_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_etiquetas" ADD CONSTRAINT "atendimento_etiquetas_etiqueta_id_etiquetas_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."etiquetas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_vendedor_atual_id_vendedores_id_fk" FOREIGN KEY ("vendedor_atual_id") REFERENCES "public"."vendedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_origem_id_origens_id_fk" FOREIGN KEY ("origem_id") REFERENCES "public"."origens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_classificado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("classificado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicoes" ADD CONSTRAINT "atribuicoes_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicoes" ADD CONSTRAINT "atribuicoes_vendedor_id_vendedores_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicoes" ADD CONSTRAINT "atribuicoes_evento_id_webhook_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."webhook_eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiquetas" ADD CONSTRAINT "etiquetas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "origens" ADD CONSTRAINT "origens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_eventos" ADD CONSTRAINT "webhook_eventos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atendimentos_empresa_data_idx" ON "atendimentos" USING btree ("empresa_id","ultima_atribuicao_em");--> statement-breakpoint
CREATE INDEX "atendimentos_vendedor_idx" ON "atendimentos" USING btree ("vendedor_atual_id");--> statement-breakpoint
CREATE INDEX "atendimentos_origem_idx" ON "atendimentos" USING btree ("origem_id");--> statement-breakpoint
CREATE INDEX "atendimentos_status_idx" ON "atendimentos" USING btree ("classificacao_status");--> statement-breakpoint
CREATE INDEX "atendimentos_cliente_idx" ON "atendimentos" USING btree ("cliente_id","ultima_atribuicao_em");--> statement-breakpoint
CREATE UNIQUE INDEX "atendimentos_conversa_uq" ON "atendimentos" USING btree ("empresa_id","conversa_id_externo") WHERE "atendimentos"."conversa_id_externo" is not null;--> statement-breakpoint
CREATE INDEX "atribuicoes_atendimento_idx" ON "atribuicoes" USING btree ("atendimento_id","atribuido_em");--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_empresa_telefone_uq" ON "clientes" USING btree ("empresa_id","telefone");--> statement-breakpoint
CREATE UNIQUE INDEX "vendedores_empresa_nome_uq" ON "vendedores" USING btree ("empresa_id","nome_normalizado");--> statement-breakpoint
CREATE UNIQUE INDEX "vendedores_empresa_externo_uq" ON "vendedores" USING btree ("empresa_id","id_externo") WHERE "vendedores"."id_externo" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_eventos_externo_uq" ON "webhook_eventos" USING btree ("empresa_id","id_externo") WHERE "webhook_eventos"."id_externo" is not null and "webhook_eventos"."status" = 'processado';--> statement-breakpoint
CREATE INDEX "webhook_eventos_recebido_idx" ON "webhook_eventos" USING btree ("recebido_em");