# Plano — Painel de Atendimento (SaaS)

> Transformar o painel do Grupo Asia num SaaS multiempresa, que recebe **tudo** o que a plataforma
> Mundo dos Bots manda no fim de cada atendimento, organiza com um agente de IA e mostra para o
> gestor **quem atendeu, de onde o lead veio e quanto tempo cada etapa levou**.

---

## 1. Como fica organizado

```
Plataforma (superadmins: master + Mundo dos Bots)
└── Empresa (cliente)            ex.: Grupo Asia · Grupo Via Norte
    ├── Chatbots                 ex.: Fiat · Multimarcas · Leap  /  Ram · Chevrolet · Honda · Renault
    │   └── cada um com seu link de webhook (token), fuso e horário de atendimento
    ├── Usuários da empresa      administrador (cria usuários e cadastros) · gerente (só vê)
    ├── Atendentes e Times
    ├── Departamentos, Origens, Etiquetas, Regras
    └── Atendimentos → Mensagens
```

- Uma empresa **nunca** vê dados de outra. O superadmin vê todas e entra em qualquer uma.
- Só o superadmin cria empresas. Cada empresa cria os próprios usuários.
- Começa do zero: banco novo. O Grupo Asia é recadastrado como o primeiro cliente.

---

## 2. O que chega (validado com disparos reais)

| Grupo | Campos | Uso |
|---|---|---|
| Contato | id, nome, telefone, `Data Criacao Contato`, `Link Conversa`, cidade | identificação, lead novo × recorrente, botão "abrir conversa" |
| Origem | `Fonte do contato` (Ads, Inbound Message…), `Canal da Conversa`, `Ref Entrada`, etiquetas | origem e canal de entrada |
| Anúncio | `ADS Texto`, `ADS Link`, `ADS Plataforma`, `ADS CTWA`, `ADS Campanha`, `ADS Nome`, `Formulario Lead` | tráfego pago por plataforma e anúncio |
| Atendimento | `Atendente`, `Atendente ID`, `Momento Envio` | quem atendeu e quando o dado foi enviado |
| Histórico | `Historico Conversa` (200) + `Historico 50` | **base de todos os tempos** |
| Todos os outros | qualquer campo personalizado | guardado e entregue ao agente de IA |

**Nada é descartado:** o JSON inteiro fica guardado; o agente recebe tudo.

### O histórico

```
Usuário (2026-06-13 7:57am): Olá, vi o anúncio...      → cliente
Bot (2026-06-13 7:57am): aguarde ... atendentes          → robô
--- (2025-12-17 3:28pm): Olá, ... Meu nome é ...         → API (Grow / agendamento) = automação
OSVALDO (2026-06-13 8:30am): bom dia                     → atendente humano
```

- Horário até o minuto, fuso de Cuiabá (configurável por chatbot).
- O de 200 corta a parte **recente** quando a conversa é longa; o de 50 sempre traz o atendimento
  atual. O sistema **junta os dois** sem repetir mensagens.
- Cada **protocolo** ("Seu protocolo de atendimento é *N*") vira um atendimento separado.
  Conversas antigas sem protocolo são separadas por pausa longa.

---

## 3. O que o sistema faz com cada disparo

1. **Recebe** pelo link do chatbot e guarda o JSON bruto (mesmo com JSON quebrado ou token errado).
2. **Lê os campos**: contato, origem, anúncio, atendente, etiquetas.
3. **Junta os históricos**, identifica o remetente de cada mensagem (cliente, robô, API, humano)
   e liga o humano ao cadastro de atendentes pelo nome.
4. **Separa em atendimentos** (por protocolo) e **calcula os tempos** de cada um.
5. **Aplica as regras** (ex.: clique em anúncio → Anúncio Meta; etiqueta Grow → RPA Grow).
6. **Agente de IA organiza**: origem, departamento, cidade, etiquetas, interesse e um resumo curto.

Reenviar o mesmo contato só atualiza; nada duplica.

---

## 4. Métricas de tempo

| Métrica | Como é calculada |
|---|---|
| **Tempo robô → humano** | da mensagem de transferência ("aguarde… atendentes") até a 1ª mensagem humana |
| **Tempo até a 1ª resposta humana** | da 1ª mensagem do cliente até a 1ª mensagem humana |
| **Tempo de resposta do atendente** | cada mensagem do cliente (já com humano) até a próxima resposta humana — média e máximo |
| **Esperas acima de 30 min** | quantas mensagens do cliente esperaram mais de 30 min pela resposta humana |
| **Atendidos por humano em até 30 min** | atendimentos cuja 1ª resposta humana saiu em até 30 min |
| **Sem atendimento humano** | atendimentos em que o cliente escreveu e nenhum humano respondeu |
| **Sem resposta** | mensagens do cliente que ficaram sem resposta até o fim |
| **Duração do atendimento** | da 1ª mensagem do cliente até a última mensagem |
| **Transferências** | atendimentos em que mais de um humano atendeu (quem passou para quem) |

**Horário de atendimento** configurável por chatbot (padrão do bot da Fiat: seg–sex 07:30–11:30 e
13:30–17:30, sáb 07:30–11:30). Mensagens fora do horário são marcadas e ficam de fora da regra dos
30 min, para não punir o atendente pela madrugada.

---

## 5. Telas

- **Painel**: leads, atendidos por humano, sem humano, % em até 30 min, tempo médio de 1ª resposta,
  duração média; tudo por **chatbot, departamento, cidade, canal, fonte, origem, anúncio, atendente e time**;
  leads novos × recorrentes; gráfico por dia e por hora.
- **Atendentes**: ranking por volume, tempo de 1ª resposta, tempo médio de resposta, esperas > 30 min,
  transferências feitas e recebidas.
- **Atendimentos**: lista com filtros e detalhe com a **conversa** (balões com horário e quem enviou),
  os tempos, os dados do anúncio e o botão "abrir na plataforma".
- **Relatórios**: PDF e planilha com os filtros.
- **Cadastros**: chatbots (link/token, fuso, horário), atendentes e times, departamentos, origens,
  etiquetas, regras, usuários.
- **Superadmin**: empresas e usuários de qualquer empresa.

### Chat de IA (balão flutuante no canto direito)

O gestor pergunta em português — "qual vendedor mais demora para responder?", "quem mais transfere?",
"quantos leads do Instagram este mês?" — e o assistente responde com texto **e gráfico**.
Ele consulta o banco por funções prontas e seguras (nunca SQL livre) e só enxerga a empresa do usuário.

---

## 6. Fases

| Fase | Entrega |
|---|---|
| **F1** | Base multiempresa: empresas, chatbots, usuários e permissões, isolamento por empresa |
| **F2** | Ingestão nova: campos, junção dos históricos, mensagens, atendimentos por protocolo, tempos |
| **F3** | Agente organizador e regras (origem, departamento, cidade, etiquetas, resumo) |
| **F4** | Painel, atendentes, atendimentos com conversa, cadastros |
| **F5** | Relatórios e chat de IA flutuante |
| **F6** | Testes com os disparos reais e deploy |

---

## 7. O que vou precisar de você (no deploy)

1. **Stack do Portainer:** trocar `POSTGRES_DB` para um banco novo (ex.: `painel_saas`). O banco atual
   fica intacto como backup.
2. **Fluxo da plataforma:** apontar o External Request para o link de cada chatbot (gerado no painel novo)
   e criar o campo **Etiquetas Nomes** = `{{user_tags}}`.
3. Recadastrar o Grupo Asia e os 3 chatbots no painel novo.

O domínio continua o mesmo por enquanto.
