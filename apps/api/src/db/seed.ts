import { and, eq, isNull, sql } from "drizzle-orm";
import { db, sqlClient } from "./client";
import { empresas, etiquetas, origens, usuarios } from "./schema";
import { rodarMigracoes } from "./migrate";

const EMPRESAS = [
  { nome: "Asia Fiat", slug: "asia-fiat", cor: "#2a78d6" },
  { nome: "Asia Multimarcas", slug: "asia-multimarcas", cor: "#eb6834" },
  { nome: "Asia Leap Motors", slug: "asia-leap-motors", cor: "#1baf7a" },
];

const ORIGENS: { nome: string; descricao: string; cor: string; empresa?: string }[] = [
  {
    nome: "RPA Grow",
    descricao: "Contato atribuído automaticamente pela ferramenta RPA do Grow (mensagens como 'contato atribuído pelo RPA Grow').",
    cor: "#6250d6",
  },
  {
    nome: "Anúncio Meta (Instagram/Facebook)",
    descricao: "Cliente veio de anúncio pago no Instagram ou Facebook, clique em anúncio, formulário de lead do Meta.",
    cor: "#e87ba4",
  },
  {
    nome: "Google",
    descricao: "Cliente veio de pesquisa ou anúncio no Google, Google Maps ou Perfil da Empresa no Google.",
    cor: "#2a78d6",
  },
  {
    nome: "Campanha de marketing",
    descricao: "Cliente respondeu a uma campanha de marketing própria: disparo em massa, e-mail marketing, promoção, evento, feirão.",
    cor: "#eb6834",
  },
  {
    nome: "Portal de veículos",
    descricao: "Cliente veio de portal de classificados como Webmotors, OLX, iCarros, Mobiauto.",
    cor: "#eda100",
  },
  {
    nome: "Site da empresa",
    descricao: "Cliente chegou pelo site institucional ou botão de WhatsApp do site.",
    cor: "#1baf7a",
  },
  {
    nome: "Indicação",
    descricao: "Cliente foi indicado por outra pessoa, amigo, parente ou outro cliente.",
    cor: "#008300",
  },
  {
    nome: "Contato direto / orgânico",
    descricao: "Cliente chamou direto no WhatsApp sem mencionar anúncio, campanha ou indicação; já conhecia a loja ou é cliente antigo.",
    cor: "#898781",
  },
  {
    nome: "Campanha Leap Motors",
    descricao: "Cliente veio de propaganda ou campanha específica da Leap Motors (lançamentos, test drive Leap, mídia da marca).",
    cor: "#e34948",
    empresa: "asia-leap-motors",
  },
];

const ETIQUETAS = [
  { nome: "Carro 0 km", descricao: "Interesse em veículo novo.", cor: "#2a78d6" },
  { nome: "Seminovo", descricao: "Interesse em veículo usado/seminovo.", cor: "#eda100" },
  { nome: "Test drive", descricao: "Pediu ou agendou test drive.", cor: "#1baf7a" },
  { nome: "Financiamento", descricao: "Perguntou sobre financiamento, parcelas, entrada, crédito.", cor: "#6250d6" },
  { nome: "Troca / avaliação", descricao: "Quer dar um carro na troca ou avaliar o usado.", cor: "#eb6834" },
  { nome: "Pós-venda / oficina", descricao: "Assunto de revisão, peças, oficina, garantia.", cor: "#898781" },
  { nome: "Venda direta / PJ", descricao: "Compra por CNPJ, frotista, PcD, taxista, produtor rural.", cor: "#e87ba4" },
  { nome: "Lead quente", descricao: "Demonstrou intenção clara de compra no curto prazo.", cor: "#e34948" },
];

export async function semear() {
  await rodarMigracoes();

  const slugParaId = new Map<string, string>();
  for (const e of EMPRESAS) {
    const [existente] = await db.select().from(empresas).where(eq(empresas.slug, e.slug));
    if (existente) {
      slugParaId.set(e.slug, existente.id);
      continue;
    }
    const [criada] = await db.insert(empresas).values(e).returning();
    slugParaId.set(e.slug, criada!.id);
    console.log(`Empresa criada: ${e.nome}`);
  }

  for (const o of ORIGENS) {
    const empresaId = o.empresa ? slugParaId.get(o.empresa)! : null;
    const [existe] = await db
      .select({ id: origens.id })
      .from(origens)
      .where(and(eq(origens.nome, o.nome), empresaId ? eq(origens.empresaId, empresaId) : isNull(origens.empresaId)));
    if (!existe) await db.insert(origens).values({ nome: o.nome, descricao: o.descricao, cor: o.cor, empresaId });
  }

  for (const et of ETIQUETAS) {
    const [existe] = await db.select({ id: etiquetas.id }).from(etiquetas).where(eq(etiquetas.nome, et.nome));
    if (!existe) await db.insert(etiquetas).values(et);
  }

  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(usuarios)
    .where(eq(usuarios.papel, "master"))) as [{ total: number }];

  if (total === 0) {
    const email = process.env.MASTER_EMAIL;
    const senha = process.env.MASTER_SENHA;
    if (!email || !senha) {
      console.warn("Nenhum master criado: defina MASTER_EMAIL e MASTER_SENHA e rode o seed de novo.");
    } else {
      await db.insert(usuarios).values({
        nome: process.env.MASTER_NOME || "Administrador",
        email: email.toLowerCase().trim(),
        senhaHash: await Bun.password.hash(senha),
        papel: "master",
      });
      console.log(`Usuário master criado: ${email}`);
    }
  }
}

if (import.meta.main) {
  await semear();
  console.log("Seed concluído.");
  await sqlClient.end();
}
