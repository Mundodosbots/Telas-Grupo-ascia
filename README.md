# Painel de Atribuições — Grupo Asia

Recebe do chatbot (Mundo dos Bots) um aviso a cada atribuição de conversa a um vendedor, guarda tudo no PostgreSQL, usa um agente da OpenAI para descobrir **de onde o cliente veio** e mostra para a gerência gráficos por **empresa, vendedor, origem e período**.

Diagrama para apresentação: [docs/como-funciona.html](docs/como-funciona.html)

```
Chatbot ──POST /api/webhook/atribuicao (token da empresa)──► API (Bun + Elysia)
                                                               │  grava evento bruto, cliente, vendedor,
                                                               │  atendimento e linha do tempo
                                                               ▼
                                                         PostgreSQL ◄── fila "pendente"
                                                               ▲            │
                                          Painel web (React) ──┘     Agente OpenAI
                                                                   (origem + etiquetas)
```

## Regras de negócio

| Regra | Como funciona |
|---|---|
| Empresas | Asia Fiat, Asia Multimarcas e Asia Leap Motors. **Cada uma tem um token**; é o token que define a empresa do atendimento. |
| Vendedores | Pertencem a uma empresa. Nomes iguais em empresas diferentes são pessoas diferentes. Vendedor novo é criado automaticamente na primeira atribuição. Duplicados (“Carlos” e “Carlos Souza”) podem ser **mesclados**, e o nome antigo continua sendo reconhecido. |
| Reatribuição | Mesma `conversa_id`, ou, sem ela, mesmo telefone na mesma empresa dentro de `JANELA_REATRIBUICAO_DIAS` (padrão 30), cai no **mesmo atendimento**. A linha do tempo guarda A → B → C → D, e **a contagem vai para o último vendedor**. |
| Origem | Uma por atendimento, escolhida pelo agente entre as origens cadastradas (a **descrição** de cada origem é o que o agente lê). Pode valer para todas as empresas ou só para uma. |
| Etiquetas | Várias por atendimento (interesse, perfil, situação). |
| Dúvida da IA | Sem origem compatível ou confiança abaixo de `AGENTE_CONFIANCA_MINIMA` (padrão 0,6) → fila **A revisar**. Se o texto indicar uma origem que não existe, a IA sugere um nome e a tela oferece “Criar”. |
| Correção humana | Ao confirmar na tela, o atendimento fica **Conferido** e a IA não mexe mais nele, nem quando chegarem novas atribuições. |
| Falhas | Se a OpenAI falhar, tenta 3 vezes (30 s de intervalo) e depois marca “Falha da IA”. Há um botão para tentar de novo. Sem `OPENAI_API_KEY`, tudo funciona e a classificação fica manual. |
| Acessos | **Master** (Mundo dos Bots): cria contas e gera tokens. **Gerente**: vê tudo, corrige classificações e mantém cadastros. |
| Período | Os filtros de data usam a data da **última atribuição**, no fuso `TZ_RELATORIOS`. |

## Contrato do webhook

```
POST /api/webhook/atribuicao
Authorization: Bearer <token da empresa>      (ou header X-Webhook-Token)
Content-Type: application/json
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `cliente_telefone` | sim | Qualquer formato; só os dígitos são guardados |
| `vendedor` | sim | Nome do vendedor (também aceita `vendedor_nome` ou `{ "vendedor": { "nome", "id", "email" } }`) |
| `resumo` | recomendado | Texto que o agente lê para achar a origem |
| `cliente_nome` | recomendado | |
| `conversa_id` | recomendado | Liga as reatribuições da mesma conversa com precisão |
| `evento_id` | recomendado | ID único do disparo; reenvios com o mesmo ID não duplicam |
| `vendedor_id` | opcional | ID do vendedor no bot; liga o vendedor mesmo que o nome mude |
| `fonte` | opcional | Pista de origem informada pelo bot (ex.: “RPA Grow”) |
| `data_atribuicao` | opcional | ISO 8601; sem ela, vale a hora do recebimento |
| *qualquer outro* | — | Guardado em `dados_extras`, sem erro |

Exemplo:

```bash
curl -X POST https://painel.seudominio.com.br/api/webhook/atribuicao \
  -H "Authorization: Bearer whk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "evento_id": "msg-123456",
    "conversa_id": "conv-98765",
    "cliente_nome": "João Silva",
    "cliente_telefone": "+55 11 99999-0000",
    "vendedor": "Carlos Souza",
    "fonte": "RPA Grow",
    "resumo": "Cliente viu o anúncio do Pulse no Instagram e perguntou sobre parcelas.",
    "data_atribuicao": "2026-11-10T14:32:00-03:00"
  }'
```

Respostas: `202` aceito (`atendimento_id`, `novo_atendimento`) · `200` com `duplicado: true` · `401` token ausente/inválido · `422` campos obrigatórios faltando · `400` JSON inválido. Tudo que chega, inclusive o que foi rejeitado, aparece em **Eventos recebidos**.

## Rodando

Precisa só de Docker.

```bash
cp .env.example .env      # edite senhas, JWT_SECRET, MASTER_* e OPENAI_API_KEY
docker compose up -d --build
```

Abra `http://localhost:3000`, entre com `MASTER_EMAIL` / `MASTER_SENHA` e, em **Empresas e webhook**, gere o token de cada empresa (o token aparece uma vez só).

Na primeira subida o app aplica as migrações e cria as 3 empresas, origens e etiquetas iniciais e o usuário master. Isso é idempotente: rodar de novo só cria o que faltar.

### Produção com domínio (HTTPS)

1. Aponte o DNS do domínio para o servidor.
2. No `.env`: `DOMINIO=painel.seudominio.com.br` e `COOKIE_SECURE=true`.
3. `docker compose --profile https up -d --build`. O Caddy obtém o certificado sozinho.

### Backup do banco

```bash
docker compose exec db pg_dump -U painel painel > backup.sql
```

## Desenvolvimento (com Bun instalado)

```bash
bun install
docker compose up -d db                        # só o Postgres (descomente "ports" no compose)
bun run dev:api                                # API em :3000 (aplica migrações/seed ao iniciar)
bun run dev:web                                # front em :5173 com proxy para a API
bun run typecheck
```

Mudou o schema (`apps/api/src/db/schema.ts`)? Rode `bun run db:generate` para criar a migração em `apps/api/drizzle/`.

## Estrutura

```
apps/api   Bun + Elysia + Drizzle (PostgreSQL)
  src/routes/webhook.ts        entrada do chatbot
  src/services/ingestao.ts     regras de cliente, vendedor, reatribuição
  src/services/classificador.ts agente OpenAI + fila no banco
  src/routes/dashboard.ts      métricas do painel
  drizzle/                     migrações SQL
apps/web   React + Vite + Tailwind + Recharts (compilado para apps/api/public)
docs/      diagrama de apresentação
```
