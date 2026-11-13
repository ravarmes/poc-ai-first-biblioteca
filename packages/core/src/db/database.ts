// Fábrica de conexão ao PostgreSQL (ADR-0022): suporta `pg` em produção e `PGlite` em memória/disco sem Docker nem senhas no repo.
import type { PGlite } from "@electric-sql/pglite";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { createRawPGlite, PGliteDialect } from "./pglite-dialect.ts";

export type AnyDatabase = Kysely<Record<string, never>>;

export interface DatabaseConfig {
  /**
   * - `"pglite://memory"` (padrão em testes)
   * - `"pglite://./scratch/pg-data"`
   * - `"postgres://..."` (PostgreSQL externo)
   */
  readonly databaseUrl?: string;
}

export interface ManagedDatabase {
  readonly db: AnyDatabase;
  readonly pglite?: PGlite;
  readonly rawExec: (sqlText: string) => Promise<void>;
  readonly ping: () => Promise<boolean>;
  readonly close: () => Promise<void>;
}

export function createManagedDatabase(config: DatabaseConfig = {}): ManagedDatabase {
  const url = config.databaseUrl ?? process.env["DATABASE_URL"] ?? "pglite://memory";

  if (url.startsWith("pglite://")) {
    const dir = url.slice("pglite://".length) || "memory";
    const client = createRawPGlite(dir);
    const db = new Kysely<Record<string, never>>({
      dialect: new PGliteDialect(client),
    });
    return {
      db,
      pglite: client,
      rawExec: async (sqlText: string) => {
        await client.exec(sqlText);
      },
      ping: async () => {
        try {
          await sql`SELECT 1`.execute(db);
          return true;
        } catch {
          return false;
        }
      },
      close: async () => {
        await db.destroy();
      },
    };
  }

  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({ pool }),
  });
  return {
    db,
    rawExec: async (sqlText: string) => {
      await pool.query(sqlText);
    },
    ping: async () => {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
    close: async () => {
      await db.destroy();
    },
  };
}
