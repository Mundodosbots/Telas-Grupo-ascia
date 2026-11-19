import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "node:path";
import postgres from "postgres";
import { env } from "../env";
import { db, sqlClient } from "./client";

/**
 * Cria o banco do painel se ele ainda não existir no servidor Postgres.
 * Útil no Postgres compartilhado (stack mb_db): o painel ganha um banco próprio
 * sem precisar de CREATE DATABASE manual.
 */
async function garantirBanco() {
  const url = new URL(env.DATABASE_URL);
  const nome = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!nome) return;
  url.pathname = "/postgres";
  const admin = postgres(url.toString(), { max: 1, onnotice: () => {} });
  try {
    const [existe] = await admin`select 1 from pg_database where datname = ${nome}`;
    if (!existe) {
      await admin.unsafe(`create database "${nome.replace(/"/g, '""')}"`);
      console.log(`Banco "${nome}" criado.`);
    }
  } catch (e) {
    // Sem permissão para criar? Segue: se o banco já existir, as migrações funcionam.
    console.warn(`Não foi possível verificar/criar o banco "${nome}": ${(e as Error).message}`);
  } finally {
    await admin.end();
  }
}

export async function rodarMigracoes() {
  await garantirBanco();
  // A versão SaaS começa num banco novo. Se este for o banco da versão antiga, não mexe em nada.
  const [antigo] = await sqlClient`select to_regclass('public.vendedores') as t`;
  if (antigo?.t) {
    throw new Error(
      "Este banco é da versão antiga do painel (tem a tabela 'vendedores'). A versão SaaS usa um banco novo: " +
        "troque POSTGRES_DB (ou DATABASE_URL) na stack para outro nome, ex.: painel_saas. O banco antigo fica intacto.",
    );
  }
  await migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });
}

if (import.meta.main) {
  await rodarMigracoes();
  console.log("Migrações aplicadas.");
  await sqlClient.end();
}
