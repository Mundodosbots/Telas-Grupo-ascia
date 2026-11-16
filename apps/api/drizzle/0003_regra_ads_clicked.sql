-- Clique em anúncio registrado nos metadados (ADS_CLICKED) = tráfego pago da Meta.
-- Em bancos que já existem; nos novos, o seed cria a mesma regra.
INSERT INTO "regras_origem" ("campo", "comparacao", "valor", "origem_id", "prioridade")
SELECT 'resumo', 'contem', 'ADS_CLICKED', o."id", 15
FROM "origens" o
WHERE o."nome" = 'Anúncio Meta (Instagram/Facebook)' AND o."empresa_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "regras_origem" r WHERE r."campo" = 'resumo' AND lower(r."valor") = 'ads_clicked');
