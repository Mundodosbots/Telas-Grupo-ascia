CREATE TABLE "etiquetas_plataforma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chatbot_id" uuid NOT NULL,
	"id_externo" text NOT NULL,
	"nome" text DEFAULT '' NOT NULL,
	"cor" text DEFAULT '#6250d6' NOT NULL,
	"destaque" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "etiquetas_plataforma" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "etiquetas_plataforma" ADD CONSTRAINT "etiquetas_plataforma_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiquetas_plataforma" ADD CONSTRAINT "etiquetas_plataforma_chatbot_id_chatbots_id_fk" FOREIGN KEY ("chatbot_id") REFERENCES "public"."chatbots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "etiquetas_plataforma_chatbot_uq" ON "etiquetas_plataforma" USING btree ("chatbot_id","id_externo");--> statement-breakpoint
CREATE INDEX "etiquetas_plataforma_empresa_idx" ON "etiquetas_plataforma" USING btree ("empresa_id");--> statement-breakpoint
-- Grow deixa de ser origem: vira etiqueta da plataforma em destaque
DELETE FROM "regras_origem" WHERE "campo" = 'etiqueta' AND lower("valor") = 'grow';--> statement-breakpoint
UPDATE "atendimentos" SET "origem_id" = NULL, "origem_regra_id" = NULL,
  "classificacao_status" = CASE WHEN "classificacao_status" = 'manual' THEN 'manual'::status_classificacao ELSE 'pendente'::status_classificacao END,
  "classificacao_tentativas" = 0
  WHERE "origem_id" IN (SELECT "id" FROM "origens" WHERE "nome" = 'RPA Grow');--> statement-breakpoint
UPDATE "origens" SET "ativo" = false WHERE "nome" = 'RPA Grow';--> statement-breakpoint
-- Etiquetas que já chegaram (guardadas no contato como "#583303") entram na lista, e o último atendimento de cada contato recebe as dele
INSERT INTO "etiquetas_plataforma" ("empresa_id", "chatbot_id", "id_externo")
  SELECT DISTINCT c."empresa_id", c."chatbot_id", substr(e, 2) FROM "contatos" c, unnest(c."etiquetas") AS e
  WHERE e ~ '^#\w+$'
  ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "atendimentos" a SET "etiquetas_plataforma" = ARRAY(SELECT substr(e, 2) FROM unnest(c."etiquetas") AS e WHERE e ~ '^#\w+$')
  FROM "contatos" c
  WHERE c."id" = a."contato_id"
    AND a."id" = (SELECT x."id" FROM "atendimentos" x WHERE x."contato_id" = c."id" ORDER BY x."inicio_em" DESC LIMIT 1);
