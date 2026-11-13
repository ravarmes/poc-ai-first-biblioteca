import { resolve } from "node:path";
import type { CopyReturnedEventV1 } from "@biblioteca/contract";
import { createManagedDatabase, type ManagedDatabase, Mediator, newUuidV7 } from "@biblioteca/core";
import { migrateDatabase } from "@biblioteca/core/migrator";
import { aPrincipal } from "@biblioteca/core/testing";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { InMemoryEmailSender } from "../infrastructure/notice-adapters.ts";
import { createInProcessNoticesFacade } from "../public/index.ts";
import { createListNoticesHandler } from "../slices/list-notices/handler.ts";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../../../../contracts/db/migrations");

describe("Integração SQL do módulo Avisos (idempotência e concorrência no PostgreSQL)", () => {
  let managed: ManagedDatabase;

  beforeAll(async () => {
    managed = createManagedDatabase({ databaseUrl: "pglite://memory" });
    await migrateDatabase(managed, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await managed.close();
  });

  test("[CS-001] [1.1] [1.2] duas entregas concorrentes em Promise.all para o mesmo holdId enviam somente um e-mail", async () => {
    const emailSender = new InMemoryEmailSender();
    const mediator = new Mediator({ db: managed.db });
    const facade = createInProcessNoticesFacade(mediator, emailSender);

    const holdId = newUuidV7();
    const makeEvent = (): CopyReturnedEventV1 => ({
      eventId: newUuidV7(),
      schemaVersion: 1,
      occurredAt: "2026-11-10T15:00:00.000Z",
      copyId: newUuidV7(),
      barcode: "BIB-2026-99",
      workId: newUuidV7(),
      workTitle: "Padrões de Arquitetura de Aplicações Corporativas",
      assignedHold: {
        holdId,
        studentId: newUuidV7(),
        studentRegistration: "2026-0001",
        recipientEmail: "ana@alu.edu.br",
        expiresAt: "2026-11-13T23:59:59.000Z",
      },
    });

    const [r1, r2] = await Promise.all([
      facade.handleCopyReturned(makeEvent()),
      facade.handleCopyReturned(makeEvent()),
    ]);

    const statuses = [r1?.status, r2?.status].sort();
    expect(statuses).toEqual(["sent", "skipped"]);
    expect(emailSender.sentMessages).toHaveLength(1);
    expect(emailSender.sentMessages[0]?.idempotencyKey).toBe(`res-${holdId}`);

    const listHandler = createListNoticesHandler();
    const listed = await mediator.send(
      listHandler,
      { studentRegistration: "2026-0001", limit: 20 },
      { principal: aPrincipal({ role: "student", studentRegistration: "2026-0001" }) },
    );
    expect(listed.items).toHaveLength(1);
  });
});
