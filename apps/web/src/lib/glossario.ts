/**
 * Explicação de cada número do painel, em linguagem de quem usa (aparece ao passar o mouse no "i").
 * Um lugar só, para o Painel, os Atendentes e os Relatórios dizerem a mesma coisa.
 */
export const GLOSSARIO = {
  atendimentos:
    "Quantas conversas terminaram no período. Cada vez que a plataforma manda o contato no fim do atendimento, conta um. O período usa a data em que a conversa começou.",
  leadsNovos: "Contatos que entraram pela primeira vez na plataforma (data de criação do contato dentro do período). Os outros já eram clientes ou contatos antigos.",
  humano:
    "Conversas que chegaram à fila de atendimento humano: o robô transferiu para um consultor ou um atendente escreveu na conversa. O resto foi resolvido só pelo robô.",
  soRobo: "Conversas que terminaram só com o robô, sem passar para um atendente.",
  semHumano:
    "Foram para a fila humana, mas nenhum atendente respondeu. São clientes que ficaram esperando: o número mais importante para ficar perto de zero.",
  ate30:
    "Das conversas que foram para um humano, quantas tiveram a 1ª resposta do atendente em até 30 minutos depois que o robô transferiu. Quanto mais perto de 100%, melhor.",
  roboHumano:
    "Quanto tempo o cliente esperou entre o robô transferir (a mensagem de \"aguarde, vou te passar para um consultor\") e a 1ª mensagem do atendente. Conta só o horário de atendimento do chatbot.",
  primeiraResposta:
    "Da 1ª mensagem que o cliente mandou até a 1ª resposta de um atendente humano. Inclui o tempo com o robô. Conta só o horário de atendimento.",
  respostaMedia:
    "Depois que o atendente entrou na conversa: em média, quanto tempo ele leva para responder cada mensagem do cliente. Mostra o ritmo da conversa, não só a primeira resposta.",
  respostasMedidas: "Quantas vezes o cliente mandou mensagem e o atendente respondeu: são as respostas usadas para calcular a média.",
  esperas30:
    "Quantas vezes, já com o atendente na conversa, o cliente mandou mensagem e esperou mais de 30 minutos (em horário de atendimento) pela resposta.",
  semResposta: "Mensagens do cliente, com um atendente na conversa, que nunca tiveram resposta até o fim do atendimento.",
  transferencias: "Quantas vezes a conversa passou de um atendente para outro. Transferiu = passou adiante; recebeu = pegou de outro atendente.",
  foraHorario: "Clientes que chegaram fora do horário de atendimento cadastrado no chatbot. Os tempos deles só começam a contar quando o expediente abre.",
  duracao: "Tempo corrido (relógio, não só expediente) da 1ª mensagem do cliente até a última mensagem da conversa, nas conversas que tiveram atendente.",
  tempoMax: "A maior espera de uma única resposta do atendente no período.",

  porDia: "Atendimentos por dia, separados por chatbot. Passe o mouse em uma barra para ver os números do dia.",
  funil:
    "O caminho do cliente: todos que conversaram, quantos foram para um humano, quantos receberam resposta e quantos foram atendidos em até 30 minutos. A queda de uma etapa para a outra mostra onde se perdem clientes.",
  roboVsHumano: "De todas as conversas, quantas o robô resolveu sozinho, quantas foram atendidas por um humano e quantas ficaram sem resposta humana.",
  medidor: "Porcentagem dos atendimentos humanos com 1ª resposta em até 30 minutos. Verde a partir de 80%, amarelo entre 50% e 80%, vermelho abaixo de 50%.",
  faixasAteHumano:
    "Como os tempos de espera se distribuem: em quantos atendimentos o cliente esperou até 5 min, de 5 a 15 min etc., entre a transferência do robô e a 1ª resposta. A média esconde os casos que demoraram muito; este gráfico mostra.",
  faixasResposta: "O mesmo, para o tempo médio de resposta do atendente em cada conversa.",
  tendencia:
    "Como o atendimento evolui dia a dia: em azul, os atendimentos humanos; em vermelho, os que ficaram sem resposta humana. A linha tracejada mostra o tempo médio do robô até o humano em cada dia.",
  tempoPorDia: "Tempo médio por dia entre a transferência do robô e a 1ª resposta do atendente. Picos mostram dias em que a fila travou.",
  mensagens: "Quem escreveu as mensagens das conversas do período: o cliente, o robô, os atendentes ou integrações (API).",
  dispersao:
    "Cada bolinha é um atendente. Para a direita = mais atendimentos; para cima = demora mais para responder. O ideal é ficar embaixo à direita (muito volume e resposta rápida).",
  rankingTempo: "Os atendentes ordenados pelo tempo médio entre a transferência do robô e a sua 1ª resposta. Barras menores são melhores.",
  departamento: "Para qual área a conversa foi (vendas, pós-venda, peças…). Definido pela IA ou pelas regras, a partir da conversa.",
  origem: "De onde o cliente veio (anúncio, Instagram, site, indicação…). Definido pelas regras de origem ou pela IA. Clique em uma linha para ver a lista.",
  cidade: "Cidade do contato, enviada pela plataforma (campo Cidade Contato).",
  canal: "Por onde a conversa chegou na plataforma (WhatsApp, Instagram, Messenger…), campo Canal da Conversa.",
  anuncio: "Plataforma do anúncio que trouxe o cliente (Facebook, Instagram…), campo ADS Plataforma. \"Sem anúncio\" = não veio de anúncio.",
  fonte: "Fonte do contato informada pela plataforma (campo Fonte do contato).",
  interesse: "O que o cliente queria, segundo a IA que lê a conversa (modelo de carro, peça, revisão…).",
  etiquetas: "Etiquetas que a plataforma tinha no contato no fim do atendimento, e em quantos atendimentos cada uma apareceu.",
  horarios: "Em que dia da semana e hora os clientes mandam a 1ª mensagem. Quanto mais escuro, mais clientes chegando. Bom para montar a escala.",
  porHora: "Total de clientes chegando em cada hora do dia, somando todos os dias da semana.",
  cidades: "Cada retângulo é uma cidade; o tamanho é a quantidade de atendimentos.",
} as const;

export type ChaveGlossario = keyof typeof GLOSSARIO;

/** Recortes da lista de atendimentos (filtro "Situação"), com o que cada um quer dizer */
export const SITUACOES = [
  { id: "humano", rotulo: "Foram para humano", dica: GLOSSARIO.humano },
  { id: "so_robo", rotulo: "Só robô", dica: GLOSSARIO.soRobo },
  { id: "respondido", rotulo: "Atendidos por humano", dica: "Foram para a fila e um atendente respondeu." },
  { id: "sem_humano", rotulo: "Sem atendimento humano", dica: GLOSSARIO.semHumano },
  { id: "ate30", rotulo: "Humano em até 30 min", dica: "A 1ª resposta do atendente veio em até 30 minutos depois da transferência do robô." },
  { id: "acima30", rotulo: "Humano depois de 30 min", dica: "A 1ª resposta do atendente demorou mais de 30 minutos, ou não veio." },
  { id: "demorou30", rotulo: "Atendente demorou mais de 30 min", dica: "Um atendente respondeu, mas a 1ª resposta veio mais de 30 minutos depois da transferência do robô." },
  { id: "esperou30", rotulo: "Esperou mais de 30 min", dica: GLOSSARIO.esperas30 },
  { id: "sem_resposta", rotulo: "Mensagem sem resposta", dica: GLOSSARIO.semResposta },
  { id: "transferido", rotulo: "Passou de um atendente para outro", dica: GLOSSARIO.transferencias },
  { id: "fora_horario", rotulo: "Chegou fora do horário", dica: GLOSSARIO.foraHorario },
] as const;

/** Faixas de tempo (mesmos limites da API) */
export const FAIXAS = ["até 5 min", "5 a 15 min", "15 a 30 min", "30 min a 1 h", "1 a 2 h", "mais de 2 h"] as const;

export const ORDENS = [
  { id: "", rotulo: "Mais recentes" },
  { id: "espera", rotulo: "Maior espera primeiro" },
  { id: "humano", rotulo: "Mais demora do robô ao humano" },
  { id: "resposta", rotulo: "Resposta média mais lenta" },
  { id: "antigos", rotulo: "Mais antigos" },
] as const;

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
