export class ErroApi extends Error {
  constructor(
    public status: number,
    message: string,
    public codigo?: string,
  ) {
    super(message);
  }
}

/** Empresa em que o superadmin está trabalhando (usuários de empresa ignoram) */
const CHAVE_EMPRESA = "empresa-ativa";
export function empresaAtiva(): string | null {
  try {
    return localStorage.getItem(CHAVE_EMPRESA);
  } catch {
    return null;
  }
}
export function definirEmpresaAtiva(id: string | null) {
  try {
    if (id) localStorage.setItem(CHAVE_EMPRESA, id);
    else localStorage.removeItem(CHAVE_EMPRESA);
  } catch {}
}

export async function api<T>(caminho: string, opcoes: { method?: string; body?: unknown } = {}): Promise<T> {
  const empresa = empresaAtiva();
  const r = await fetch(`/api${caminho}`, {
    method: opcoes.method ?? "GET",
    credentials: "same-origin",
    headers: {
      ...(opcoes.body !== undefined && { "content-type": "application/json" }),
      ...(empresa && { "x-empresa": empresa }),
    },
    body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
  });
  const dados = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && !caminho.startsWith("/auth/login")) window.dispatchEvent(new Event("sessao-expirada"));
    throw new ErroApi(r.status, dados?.erro ?? `Erro ${r.status}`, dados?.codigo);
  }
  return dados as T;
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ---------------- Tipos das respostas ---------------- */

export type Papel = "superadmin" | "admin" | "gerente";
export type Usuario = { id: string; nome: string; email: string; papel: Papel; empresaId: string | null };
export type EmpresaResumo = { id: string; nome: string; ativo: boolean };
export type Perfil = { usuario: Usuario; empresas: EmpresaResumo[] };
export type UsuarioLista = Usuario & { ativo: boolean; ultimoLoginEm: string | null; criadoEm: string };

export type Empresa = EmpresaResumo & { slug: string; criadoEm: string; chatbots: number; usuarios: number; atendimentos: number; ultimoEvento: string | null };

export type Horario = Record<string, [string, string][]>;
export type Chatbot = {
  id: string;
  nome: string;
  cor: string;
  tokenPrefixo: string | null;
  tokenGeradoEm: string | null;
  contaExterna: string | null;
  fuso: string;
  horario: Horario;
  ativo: boolean;
  hoje: number;
  recusadosHoje: number;
  ultimoEvento: string | null;
  atendimentos: number;
};

export type ItemCadastro = { id: string; nome: string; descricao: string; cor: string; ativo: boolean; uso: number };
export type Time = { id: string; nome: string; cor: string; atendentes: number };
export type Atendente = {
  id: string;
  nome: string;
  email: string | null;
  idExterno: string | null;
  apelidos: string[];
  ativo: boolean;
  timeId: string | null;
  timeNome: string | null;
  timeCor: string | null;
  atendimentos: number;
  ultimoAtendimento: string | null;
};

export type StatusClassificacao = "pendente" | "processando" | "classificado" | "erro" | "manual";
export type EtiquetaMini = { id: string; nome: string; cor: string };

export type AtendimentoItem = {
  id: string;
  protocolo: string | null;
  chatbotId: string;
  chatbotNome: string;
  chatbotCor: string;
  contatoNome: string;
  contatoTelefone: string | null;
  atendenteId: string | null;
  atendenteNome: string | null;
  origemId: string | null;
  origemNome: string | null;
  origemCor: string | null;
  departamentoNome: string | null;
  departamentoCor: string | null;
  cidade: string | null;
  canal: string | null;
  fonte: string | null;
  interesse: string | null;
  resumo: string | null;
  inicioEm: string;
  ultimaMsgEm: string;
  precisouHumano: boolean;
  semHumano: boolean;
  atendidoAte30: boolean | null;
  tempoAteHumanoS: number | null;
  tempoMedioRespostaS: number | null;
  tempoMaxRespostaS: number | null;
  semResposta: number;
  esperasAcima30: number;
  transferencias: number;
  leadNovo: boolean;
  historicoIncompleto: boolean;
  status: StatusClassificacao;
  etiquetas: EtiquetaMini[];
};
export type Pagina<T> = { total: number; pagina: number; porPagina: number; itens: T[] };

export type MensagemConversa = {
  id: string;
  em: string;
  tipo: "cliente" | "bot" | "api" | "humano";
  remetente: string;
  texto: string;
  /** Mensagem do cliente na fila: quanto esperou (s, em horário de atendimento) pela resposta humana */
  esperaS?: number;
  /** Mensagem do cliente que ficou sem resposta humana */
  semResposta?: boolean;
  marco?: "transferencia" | "primeira_humana";
};
export type AtendimentoDetalhe = {
  id: string;
  protocolo: string | null;
  chatbotNome: string;
  chatbotCor: string;
  fuso: string;
  contato: {
    id: string;
    nome: string;
    telefone: string | null;
    cidade: string | null;
    linkConversa: string | null;
    criadoNaPlataformaEm: string | null;
    etiquetas: string[];
    campos: Record<string, string>;
  };
  atendenteId: string | null;
  atendenteNome: string | null;
  origemId: string | null;
  origemNome: string | null;
  origemCor: string | null;
  origemPorRegra: boolean;
  departamentoId: string | null;
  departamentoNome: string | null;
  departamentoCor: string | null;
  cidade: string | null;
  interesse: string | null;
  resumo: string | null;
  fonte: string | null;
  canal: string | null;
  refEntrada: string | null;
  anuncio: Record<string, string | undefined> | null;
  inicioEm: string;
  ultimaMsgEm: string;
  primeiraMsgClienteEm: string | null;
  transferenciaEm: string | null;
  primeiraRespostaHumanaEm: string | null;
  msgsCliente: number;
  msgsBot: number;
  msgsApi: number;
  msgsHumano: number;
  tempoAteHumanoS: number | null;
  tempoPrimeiraRespostaS: number | null;
  tempoMedioRespostaS: number | null;
  tempoMaxRespostaS: number | null;
  respostasMedidas: number;
  esperasAcima30: number;
  semResposta: number;
  precisouHumano: boolean;
  semHumano: boolean;
  atendidoAte30: boolean | null;
  duracaoS: number | null;
  transferencias: number;
  foraHorario: boolean;
  leadNovo: boolean;
  historicoIncompleto: boolean;
  classificacaoStatus: StatusClassificacao;
  classificacaoConfianca: number | null;
  classificacaoJustificativa: string | null;
  classificacaoErro: string | null;
  classificadoPor: string | null;
  etiquetas: EtiquetaMini[];
  humanos: { atendenteId: string; nome: string; ordem: number; primeiraMsgEm: string; mensagens: number }[];
  conversa: MensagemConversa[];
  outros: { id: string; protocolo: string | null; inicioEm: string; origemNome: string | null; atendenteNome: string | null }[];
};

/** Métricas iguais para o total e para cada agrupamento do painel */
export type Metricas = {
  total: number;
  humano: number;
  semHumano: number;
  ate30: number;
  comTempo: number;
  tempoAteHumano: number | null;
  tempoPrimeiraResposta: number | null;
  tempoMedioResposta: number | null;
  tempoMaxResposta: number | null;
  esperas30: number;
  respostas: number;
  semResposta: number;
  transferencias: number;
  leadsNovos: number;
  foraHorario: number;
  duracao: number | null;
};
export type Grupo = Metricas & { chave: string | null; rotulo: string; cor?: string | null; timeNome?: string | null };
export type Painel = {
  resumo: Metricas;
  porChatbot: Grupo[];
  porDepartamento: Grupo[];
  porCidade: Grupo[];
  porCanal: Grupo[];
  porFonte: Grupo[];
  porOrigem: Grupo[];
  porAnuncio: Grupo[];
  porAtendente: Grupo[];
  porTime: Grupo[];
  transferencias: { chave: string; rotulo: string; feitas: number; recebidas: number; participou: number }[];
  serie: { dia: string; chatbotId: string; total: number; humano: number; semHumano: number; ate30: number; comTempo: number; somaTempo: number; leadsNovos: number }[];
  horarios: { diaSemana: number; hora: number; total: number }[];
  /** Faixas: 0 = até 5 min, 1 = 5–15, 2 = 15–30, 3 = 30–60, 4 = 1–2 h, 5 = mais de 2 h */
  faixasAteHumano: { faixa: number; total: number }[];
  faixasResposta: { faixa: number; total: number }[];
  mensagens: { cliente: number; bot: number; humano: number; api: number };
  porInteresse: Grupo[];
  porEtiqueta: { chave: string; rotulo: string; cor: string | null; total: number }[];
};

export type Regra = {
  id: string;
  campo: "etiqueta" | "fonte" | "canal" | "anuncio" | "texto";
  comparacao: "igual" | "contem";
  valor: string;
  origemId: string;
  origemNome: string;
  origemCor: string;
  prioridade: number;
  ativo: boolean;
  uso: number;
};

export type StatusSistema = {
  agenteAtivo: boolean;
  modelo: string | null;
  fusoHorario: string;
  pendentes: number;
  erros: number;
  ultimaAlteracao: string | null;
  ultimoEvento: { recebidoEm: string; status: string } | null;
};

export type Evento = {
  id: string;
  chatbotNome: string | null;
  chatbotCor: string | null;
  contatoId: string | null;
  contatoNome: string | null;
  status: "processado" | "rejeitado" | "capturado";
  erro: string | null;
  resultado: Record<string, unknown> | null;
  tamanhoBytes: number;
  recebidoEm: string;
};

export type ListaRelatorio = { total: number; limite: number; itens: (Omit<AtendimentoItem, "etiquetas"> & { etiquetas: string[] })[] };

export type Grafico = { tipo: "barras" | "linha" | "pizza"; titulo: string; unidade: string; dados: { rotulo: string; valor: number }[] };
export type RespostaAssistente = { texto: string; grafico: Grafico | null };
