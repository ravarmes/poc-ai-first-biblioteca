import { resolve } from "node:path";
import {
  createManagedDatabase,
  type ManagedDatabase,
  Mediator,
  runInUnitOfWork,
  writeAuditEvents,
} from "@biblioteca/core";
import { migrateDatabase } from "@biblioteca/core/migrator";
import { aPrincipal } from "@biblioteca/core/testing";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { AUDIT_READER_SCOPE } from "../domain/audit-query.ts";
import { createListAuditEventsHandler } from "../slices/list-audit-events/handler.ts";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../../../../contracts/db/migrations");

describe("Integração SQL do módulo Auditoria (role audit_reader somente leitura)", () => {
  let managed: ManagedDatabase;

  beforeAll(async () => {
    managed = createManagedDatabase({ databaseUrl: "pglite://memory" });
    await migrateDatabase(managed, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await managed.close();
  });

  test("[2.1] [2.2] [2.3] audit_reader lê eventos paginados e é barrada ao tentar INSERT em audit.events", async () => {
    const mediator = new Mediator({ db: managed.db });
    const lib = aPrincipal({ role: "librarian" });
    const student = aPrincipal({ role: "student" });

    // Grava três eventos simulando módulos autorizados
    await runInUnitOfWork(managed.db, { role: "mod_config", searchPath: "config" }, async (trx) => {
      await writeAuditEvents(trx, [
        { action: "work.created", resourceType: "work", resourceId: "w1", actorId: lib.userId, actorRole: "librarian" },
        {
          action: "fine_rate.updated",
          resourceType: "fine_rate",
          resourceId: "default",
          actorId: lib.userId,
          actorRole: "librarian",
          changes: { dailyRateCents: { before: 100, after: 250 } },
        },
        { action: "loan.created", resourceType: "loan", resourceId: "l1", actorId: lib.userId, actorRole: "librarian" },
      ]);
    });

    // Aluno recebe forbidden e Mediator grava authz.denied sem falhar mesmo com scope audit_reader
    const handler = createListAuditEventsHandler();
    await expect(mediator.send(handler, { limit: 20 }, { principal: student })).rejects.toMatchObject({
      code: "forbidden",
    });

    // Bibliotecária lista ordenando id DESC e paginando por cursor
    const page1 = await mediator.send(handler, { limit: 2 }, { principal: lib });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await mediator.send(handler, { limit: 2, cursor: page1.nextCursor! }, { principal: lib });
    expect(page2.items.length).toBeGreaterThanOrEqual(2);
    const seen = new Set(page1.items.map((e) => e.id));
    expect(page2.items.some((e) => seen.has(e.id))).toBe(false);

    // Verifica que filtro por ação funciona no SQL real
    const filtered = await mediator.send(
      handler,
      { action: "fine_rate.updated", result: "success", limit: 20 },
      { principal: lib },
    );
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.changes).toEqual({ dailyRateCents: { before: 100, after: 250 } });

    // Prova que o PostgreSQL recusa INSERT sob audit_reader
    await expect(
      runInUnitOfWork(managed.db, AUDIT_READER_SCOPE, async (trx) => {
        await sql`
          INSERT INTO audit.events (id, request_id, action, resource_type, result)
          VALUES (gen_random_uuid(), 'req-bad', 'fake.action', 'fake', 'success')
        `.execute(trx);
      }),
    ).rejects.toThrow();
  });
});
