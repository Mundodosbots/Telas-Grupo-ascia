import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

// onnotice: silencia avisos do Postgres como "já existe, pulando" das migrações
export const sqlClient = postgres(env.DATABASE_URL, { max: 10, onnotice: () => {} });
export const db = drizzle(sqlClient, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
