import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "node:path";
import { db, sqlClient } from "./client";

export async function rodarMigracoes() {
  await migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });
}

if (import.meta.main) {
  await rodarMigracoes();
  console.log("Migrações aplicadas.");
  await sqlClient.end();
}
