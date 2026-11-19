import { eq, sql } from "drizzle-orm";
import { db, sqlClient } from "./client";
import { rodarMigracoes } from "./migrate";
import { departamentos, etiquetas, origens, regrasOrigem, usuarios } from "./schema";

type Item = { nome: string; descricao: string; cor: string };

/** Origens iniciais de toda empresa nova (a empresa edita depois) */
export const ORIGENS_PADRAO: Item[] = [
  { nome: "Anúncio Instagram", descricao: "Clicou num anúncio pago do Instagram (ADS Plataforma = Instagram, link do post do Instagram).", cor: "#e87ba4" },
  { nome: "Anúncio Facebook", descricao: "Clicou num anúncio pago do Facebook (ADS Plataforma = Facebook, link fb.me).", cor: "#2a78d6" },
  {
    nome: "Anúncio (plataforma não identificada)",
    descricao: "Veio de anúncio (fonte Ads, 'vi o anúncio', clique em anúncio) mas não dá para saber se foi Instagram ou Facebook.",
    cor: "#eda100",
  },
  { nome: "RPA Grow", descricao: "Contato enviado pela integração do Grow (etiqueta Grow, mensagens de API do Grow).", cor: "#6250d6" },
  { nome: "Google", descricao: "Pesquisa ou anúncio no Google, Google Maps, Perfil da Empresa no Google.", cor: "#1baf7a" },
  { nome: "Portal de veículos", descricao: "Webmotors, OLX, iCarros, Mobiauto e outros classificados.", cor: "#b3741b" },
  { nome: "Site da empresa", descricao: "Botão de WhatsApp ou formulário do site da empresa.", cor: "#0f8a8a" },
  { nome: "Indicação", descricao: "Indicado por amigo, parente ou outro cliente.", cor: "#008300" },
  {
    nome: "Campanha de marketing",
    descricao: "Respondeu a um disparo em massa, e-mail, promoção, feirão ou evento da loja. Não use para anúncio pago clicado.",
    cor: "#eb6834",
  },
  {
    nome: "Contato direto / orgânico",
    descricao: "Chamou direto, já conhecia a loja ou é cliente antigo, sem nenhuma pista de anúncio, campanha ou indicação.",
    cor: "#898781",
  },
];

export const DEPARTAMENTOS_PADRAO: Item[] = [
  { nome: "Vendas (0 km)", descricao: "Compra de veículo novo, cotação, test drive, condições de compra.", cor: "#2a78d6" },
  { nome: "Seminovos", descricao: "Compra ou venda de veículo usado/seminovo, avaliação de troca.", cor: "#eda100" },
  { nome: "Pós-venda / Oficina", descricao: "Revisão, manutenção, agendamento de serviço, garantia, recall, problema no veículo.", cor: "#898781" },
  { nome: "Peças", descricao: "Compra ou consulta de peças, preço de peça, pedido de peça.", cor: "#6250d6" },
  { nome: "Acessórios", descricao: "Acessórios para o veículo (tapete, película, engate etc.).", cor: "#1baf7a" },
  { nome: "Venda direta / Frotas", descricao: "Compra por CNPJ, frotista, PcD, taxista, produtor rural, locadora.", cor: "#e87ba4" },
  { nome: "Financeiro", descricao: "Boleto, cobrança, nota fiscal, documentação, financiamento já contratado.", cor: "#e34948" },
  { nome: "Outros", descricao: "Assunto que não se encaixa nos demais (currículo, reclamação geral, engano).", cor: "#b4b8c5" },
];

export const ETIQUETAS_PADRAO: Item[] = [
  { nome: "Lead quente", descricao: "Intenção clara de compra no curto prazo.", cor: "#e34948" },
  { nome: "Financiamento", descricao: "Perguntou sobre financiamento, parcelas, entrada.", cor: "#6250d6" },
  { nome: "Troca / avaliação", descricao: "Quer dar um carro na troca ou avaliar o usado.", cor: "#eb6834" },
  { nome: "Test drive", descricao: "Pediu ou agendou test drive.", cor: "#1baf7a" },
  { nome: "Agendamento", descricao: "Agendou visita ou serviço.", cor: "#2a78d6" },
  { nome: "Reclamação", descricao: "Reclamou do atendimento, do produto ou do serviço.", cor: "#c22f2f" },
  { nome: "Sem resposta do cliente", descricao: "O cliente parou de responder.", cor: "#898781" },
];

/** Cria os cadastros iniciais de uma empresa nova (origens, departamentos, etiquetas e regras) */
export async function semearEmpresa(empresaId: string) {
  const criadas = await db
    .insert(origens)
    .values(ORIGENS_PADRAO.map((o) => ({ ...o, empresaId })))
    .returning({ id: origens.id, nome: origens.nome });
  await db.insert(departamentos).values(DEPARTAMENTOS_PADRAO.map((d) => ({ ...d, empresaId })));
  await db.insert(etiquetas).values(ETIQUETAS_PADRAO.map((e) => ({ ...e, empresaId })));
  const id = (nome: string) => criadas.find((o) => o.nome === nome)!.id;
  // Ordem: etiqueta Grow → plataforma do anúncio → clique em anúncio no texto → fonte Ads
  await db.insert(regrasOrigem).values([
    { empresaId, campo: "etiqueta", comparacao: "igual", valor: "Grow", origemId: id("RPA Grow"), prioridade: 10 },
    { empresaId, campo: "anuncio", comparacao: "igual", valor: "Instagram", origemId: id("Anúncio Instagram"), prioridade: 20 },
    { empresaId, campo: "anuncio", comparacao: "igual", valor: "Facebook", origemId: id("Anúncio Facebook"), prioridade: 30 },
    { empresaId, campo: "texto", comparacao: "contem", valor: "ADS_CLICKED", origemId: id("Anúncio (plataforma não identificada)"), prioridade: 40 },
    { empresaId, campo: "fonte", comparacao: "igual", valor: "Ads", origemId: id("Anúncio (plataforma não identificada)"), prioridade: 50 },
  ]);
}

/** Migrações + superadmin inicial (MASTER_EMAIL / MASTER_SENHA). Idempotente. */
export async function semear() {
  await rodarMigracoes();
  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(usuarios)
    .where(eq(usuarios.papel, "superadmin"))) as [{ total: number }];
  if (total > 0) return;
  const email = process.env.MASTER_EMAIL;
  const senha = process.env.MASTER_SENHA;
  if (!email || !senha) {
    console.warn("Nenhum superadmin criado: defina MASTER_EMAIL e MASTER_SENHA.");
    return;
  }
  await db.insert(usuarios).values({
    nome: process.env.MASTER_NOME || "Administrador",
    email: email.toLowerCase().trim(),
    senhaHash: await Bun.password.hash(senha),
    papel: "superadmin",
  });
  console.log(`Superadmin criado: ${email}`);
}

if (import.meta.main) {
  await semear();
  console.log("Seed concluído.");
  await sqlClient.end();
}
