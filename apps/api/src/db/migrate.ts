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
  await migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });
}

if (import.meta.main) {
  await rodarMigracoes();
  console.log("Migrações aplicadas.");
  await sqlClient.end();
}
