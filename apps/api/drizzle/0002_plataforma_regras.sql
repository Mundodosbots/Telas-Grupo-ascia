CREATE TABLE "dicionario_etiquetas" (
	"empresa_id" uuid NOT NULL,
	"id_externo" text NOT NULL,
	"nome" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dicionario_etiquetas_empresa_id_id_externo_pk" PRIMARY KEY("empresa_id","id_externo")
);
--> statement-breakpoint
CREATE TABLE "regras_origem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"campo" text DEFAULT 'etiqueta' NOT NULL,
	"comparacao" text DEFAULT 'igual' NOT NULL,
	"valor" text NOT NULL,
	"origem_id" uuid NOT NULL,
	"prioridade" integer DEFAULT 100 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "etiquetas_plataforma" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "campos_plataforma" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "origem_regra_id" uuid;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "id_externo" text;--> statement-breakpoint
ALTER TABLE "dicionario_etiquetas" ADD CONSTRAINT "dicionario_etiquetas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_origem" ADD CONSTRAINT "regras_origem_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_origem" ADD CONSTRAINT "regras_origem_origem_id_origens_id_fk" FOREIGN KEY ("origem_id") REFERENCES "public"."origens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_origem_regra_id_regras_origem_id_fk" FOREIGN KEY ("origem_regra_id") REFERENCES "public"."regras_origem"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_empresa_externo_uq" ON "clientes" USING btree ("empresa_id","id_externo") WHERE "clientes"."id_externo" is not null;