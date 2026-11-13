import { resolve } from "node:path";
import { createManagedDatabase } from "@biblioteca/core";
import { migrateDatabase } from "@biblioteca/core/migrator";

const databaseUrl = process.env.DATABASE_URL ?? "pglite://memory";
const migrationsDir = resolve(import.meta.dirname, "../../../contracts/db/migrations");

const managed = createManagedDatabase({ databaseUrl });
try {
  const applied = await migrateDatabase(managed, migrationsDir);
  console.log(
    JSON.stringify({
      databaseUrl: databaseUrl.startsWith("postgres") ? "postgres://***" : databaseUrl,
      appliedCount: applied.length,
      applied,
    }),
  );
} finally {
  await managed.close();
}
