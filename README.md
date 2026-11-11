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

## Formato da plataforma (Mundo dos Bots)

O webhook reconhece sozinho o JSON da plataforma, que é o **contato inteiro** (`id`, `full_name`, `phone`, `tags: [{id}]`, `custom_fields: [{name, value}]`). Basta configurar o disparo para `POST /api/webhook/atribuicao?token=<token da empresa>`, sem montar JSON próprio.

| Dado no painel | De onde vem |
|---|---|
| Cliente | `full_name`, `phone`; reconhecido pelo `id` do contato (atualiza nome/telefone se mudarem) |
| Vendedor | campo personalizado **`Consultor`** (vazio → "Sem consultor") |
| Resumo | campo personalizado **`Resumo conversa`** (a IA dá destaque à seção "Origem do contato") |
| Fonte | campo personalizado **`Fonte do contato`** |
| Etiquetas | `tags` traduzidas pelo **dicionário** da empresa (Empresas e webhook → Importar etiquetas) |
| Outros campos | guardados e mostrados no atendimento; pesquisas de satisfação são ignoradas |

**Origem:** primeiro as **Regras de origem** (ex.: etiqueta `Grow` → RPA Grow), na ordem da tela; se nenhuma bater, a IA decide pelo resumo, etiquetas, fonte e campos. Com regra, a IA só escolhe as etiquetas do painel.

**Reenvios:** o mesmo contato com o **mesmo consultor** só atualiza os dados (não conta repasse). Com **outro consultor**, entra na linha do tempo e a contagem passa para ele. Depois de `JANELA_REATRIBUICAO_DIAS` sem atribuição, o contato abre um atendimento novo.

## Contrato do webhook (JSON genérico)

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
curl -X POST https://ascia-screen.mundodosbots.com.br/api/webhook/atribuicao \
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

## Produção: VPS com Portainer + Traefik

Endereço: **https://ascia-screen.mundodosbots.com.br**. Segue o mesmo padrão das outras stacks da Mundo dos Bots: Docker Swarm, Traefik na rede `CLNet` com `letsencryptresolver` e Postgres da stack `mb_db`. O painel usa um **banco próprio** (`ascia_screen`) nesse servidor e cria o banco sozinho na primeira subida.

**1. Publicar a imagem no Docker Hub** (na máquina de desenvolvimento, com `docker login` feito numa conta com acesso à organização `mundodosbots`):

```bash
docker build -t mundodosbots/ascia-screen:latest -t mundodosbots/ascia-screen:$(git rev-parse --short HEAD) .
docker push mundodosbots/ascia-screen --all-tags
```

**2. DNS:** no Cloudflare, registro `A` `ascia-screen` → IP da VPS.

**3. Portainer → Stacks → Add stack:** cole [deploy/portainer-stack.yml](deploy/portainer-stack.yml) e preencha as variáveis:

| Variável | Obrigatória | O que é |
|---|---|---|
| `POSTGRES_PASSWORD` | sim | Senha do usuário do Postgres (a mesma da stack `mb_db`) |
| `JWT_SECRET` | sim | Segredo das sessões, 32+ caracteres aleatórios |
| `MASTER_EMAIL` / `MASTER_SENHA` | sim, no 1º deploy | Login master inicial (troque a senha depois pela tela) |
| `OPENAI_API_KEY` | recomendada | Sem ela, a classificação fica manual |
| `IMAGE_TAG` | não | Versão da imagem (padrão `latest`); use o hash do commit para poder voltar atrás |
| `POSTGRES_HOST` / `POSTGRES_USER` / `POSTGRES_DB` | não | Padrões: `mb_postgres`, `mbuser`, `ascia_screen` |

**4. Primeiro acesso:** entre com o master, vá em **Empresas e webhook** e gere o token de cada empresa. A URL do webhook para o chatbot é `https://ascia-screen.mundodosbots.com.br/api/webhook/atribuicao`.

**Atualizar:** publique a imagem nova (passo 1) e, no Portainer, abra o serviço e clique em *Update* com *Re-pull image* (ou troque o `IMAGE_TAG`). A atualização é `start-first` com rollback automático se o container novo não subir; as migrações do banco rodam sozinhas.

**Backup:**

```bash
docker exec $(docker ps -q -f name=mb_db_mb_postgres) pg_dump -U mbuser ascia_screen > ascia_screen.sql
```

### Fora do Portainer (VPS simples com Docker Compose)

O `docker-compose.yml` da raiz sobe app + Postgres próprio. Com `DOMINIO` e `COOKIE_SECURE=true` no `.env`, `docker compose --profile https up -d --build` adiciona um Caddy com HTTPS automático.

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
