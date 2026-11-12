export class ErroApi extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(caminho: string, opcoes: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`/api${caminho}`, {
    method: opcoes.method ?? "GET",
    credentials: "same-origin",
    headers: opcoes.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
  });
  const dados = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && !caminho.startsWith("/auth/login")) window.dispatchEvent(new Event("sessao-expirada"));
    throw new ErroApi(r.status, dados?.erro ?? `Erro ${r.status}`);
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

export type Papel = "master" | "gerente";
export type Usuario = { id: string; nome: string; email: string; papel: Papel };
export type UsuarioLista = Usuario & { ativo: boolean; ultimoLoginEm: string | null; criadoEm: string };

export type Empresa = {
  id: string;
  nome: string;
  slug: string;
  cor: string;
  ativo: boolean;
  tokenPrefixo: string | null;
  tokenGeradoEm: string | null;
  etiquetasPlataforma?: number;
};

export type Vendedor = {
  id: string;
  nome: string;
  email: string | null;
  idExterno: string | null;
  apelidos: string[];
  ativo: boolean;
  empresaId: string;
  empresaNome: string;
  empresaCor: string;
  atendimentos: number;
  ultimaAtribuicao: string | null;
};

export type ItemCadastro = {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  empresaId: string | null;
  ativo: boolean;
  uso: number;
};

export type StatusClassificacao = "pendente" | "processando" | "classificado" | "revisar" | "erro" | "manual";
export type EtiquetaMini = { id: string; nome: string; cor: string };

export type AtendimentoItem = {
  id: string;
  empresaId: string;
  empresaNome: string;
  empresaCor: string;
  clienteNome: string;
  clienteTelefone: string;
  vendedorId: string;
  vendedorNome: string;
  origemId: string | null;
  origemNome: string | null;
  origemCor: string | null;
  resumo: string;
  totalAtribuicoes: number;
  ultimaAtribuicaoEm: string;
  status: StatusClassificacao;
  confianca: number | null;
  sugestao: string | null;
  etiquetas: EtiquetaMini[];
};

export type LinhaRelatorio = {
  id: string;
  empresaNome: string;
  clienteNome: string;
  clienteTelefone: string;
  vendedorNome: string;
  origemNome: string | null;
  totalAtribuicoes: number;
  primeiraAtribuicaoEm: string;
  ultimaAtribuicaoEm: string;
  status: StatusClassificacao;
  etiquetasPlataforma: string[];
  etiquetas: string[];
};
export type ListaRelatorio = { total: number; limite: number; itens: LinhaRelatorio[] };

export type Pagina<T> ={ total: number; pagina: number; porPagina: number; itens: T[] };

export type Regra = {
  id: string;
  empresaId: string | null;
  empresaNome: string | null;
  campo: "etiqueta" | "fonte";
  comparacao: "igual" | "contem";
  valor: string;
  origemId: string;
  origemNome: string;
  origemCor: string;
  prioridade: number;
  ativo: boolean;
  uso: number;
};

export type AtendimentoDetalhe = Omit<AtendimentoItem, "status"> & {
  status: StatusClassificacao;
  etiquetasPlataforma: string[];
  camposPlataforma: Record<string, string>;
  origemPorRegra: boolean;
  clienteIdExterno: string | null;
  clienteId: string;
  conversaId: string | null;
  fonteInformada: string | null;
  primeiraAtribuicaoEm: string;
  justificativa: string | null;
  erro: string | null;
  tentativas: number;
  classificadoEm: string | null;
  classificadoPor: string | null;
  linhaDoTempo: {
    id: string;
    vendedorId: string;
    vendedorNome: string;
    resumo: string;
    fonte: string | null;
    dadosExtras: Record<string, unknown>;
    atribuidoEm: string;
    eventoId: string | null;
    payload: unknown;
  }[];
  outrosAtendimentos: { id: string; ultimaAtribuicaoEm: string; vendedorNome: string }[];
};

export type Dashboard = {
  resumo: {
    total: number;
    aRevisar: number;
    pendentes: number;
    semOrigem: number;
    reatribuidos: number;
    classificadosIa: number;
    vendedores: number;
  };
  porEmpresa: { id: string; nome: string; cor: string; total: number }[];
  porVendedor: {
    id: string;
    nome: string;
    empresaId: string;
    empresaNome: string;
    empresaCor: string;
    total: number;
    reatribuidos: number;
  }[];
  porOrigem: { id: string | null; nome: string | null; cor: string | null; total: number }[];
  porEtiqueta: { id: string; nome: string; cor: string; total: number }[];
  serie: { dia: string; empresaId: string; total: number }[];
  vendedorOrigem: { vendedorId: string; origemId: string | null; total: number }[];
};

export type StatusSistema = {
  agenteAtivo: boolean;
  modelo: string | null;
  fusoHorario: string;
  pendentes: number;
  aRevisar: number;
  ultimoEvento: { recebidoEm: string; status: string } | null;
  ultimaAlteracao: string | null;
};

export type Evento = {
  id: string;
  empresaNome: string | null;
  empresaCor: string | null;
  idExterno: string | null;
  status: "processado" | "rejeitado" | "duplicado" | "capturado";
  erro: string | null;
  atendimentoId: string | null;
  recebidoEm: string;
  payload: unknown;
};
