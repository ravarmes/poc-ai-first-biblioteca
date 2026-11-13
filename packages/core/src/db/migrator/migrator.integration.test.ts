import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createManagedDatabase, type ManagedDatabase } from "../database.ts";
import { runInUnitOfWork } from "../unit-of-work.ts";
import { getMigrationStatus, migrateDatabase } from "./migrator.ts";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../../../../../contracts/db/migrations");

describe("Runner de migrations e fronteira entre schemas no PostgreSQL (ADR-0016, ADR-0018)", () => {
  let managed: ManagedDatabase;

  beforeAll(async () => {
    managed = createManagedDatabase({ databaseUrl: "pglite://memory" });
  });

  afterAll(async () => {
    await managed.close();
  });

  test("aplica 0001..0006 em banco limpo, é idempotente na segunda execução e relata status sem pendências", async () => {
    const before = await getMigrationStatus(managed, MIGRATIONS_DIR);
    expect(before.applied).toEqual([]);
    expect(before.pending).toEqual(["0001", "0002", "0003", "0004", "0005", "0006"]);

    const first = await migrateDatabase(managed, MIGRATIONS_DIR);
    expect(first.map((m) => m.version)).toEqual(["0001", "0002", "0003", "0004", "0005", "0006"]);

    const second = await migrateDatabase(managed, MIGRATIONS_DIR);
    expect(second).toEqual([]);

    const after = await getMigrationStatus(managed, MIGRATIONS_DIR);
    expect(after).toEqual({
      applied: ["0001", "0002", "0003", "0004", "0005", "0006"],
      pending: [],
      errors: [],
    });
  });

  test("detecta adulteração de checksum em migration já aplicada", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bib-mig-"));
    try {
      cpSync(MIGRATIONS_DIR, dir, { recursive: true });
      writeFileSync(join(dir, "0002_catalog.sql"), "-- adulterado\nSELECT 1;\n", "utf8");
      await expect(migrateDatabase(managed, dir)).rejects.toThrow(/checksum/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("PostgreSQL recusa acesso cruzado entre schemas de módulos e escrita pela role audit_reader", async () => {
    // Em PostgreSQL/PGlite, `SET LOCAL ROLE mod_circulation` rebaixa privilégios mesmo partindo do superusuário.
    await expect(
      runInUnitOfWork(managed.db, { role: "mod_circulation", searchPath: "circulation" }, async (trx) => {
        await sql`SELECT count(*) FROM catalog.works`.execute(trx);
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      runInUnitOfWork(managed.db, { role: "mod_catalog", searchPath: "catalog" }, async (trx) => {
        await sql`SELECT count(*) FROM circulation.loans`.execute(trx);
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      runInUnitOfWork(managed.db, { role: "audit_reader", searchPath: "audit" }, async (trx) => {
        await sql`
          INSERT INTO audit.events (id, request_id, action, resource_type, result)
          VALUES ('0193b2c0-0000-7000-8000-000000000099'::uuid, 'req', 'hack.attempt', 'audit', 'success')
        `.execute(trx);
      }),
    ).rejects.toThrow(/permission denied/i);
  });
});
