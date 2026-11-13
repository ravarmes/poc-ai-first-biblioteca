import { newUuidV7 } from "@biblioteca/core";
import { aPrincipal, createInMemoryMediator } from "@biblioteca/core/testing";
import { describe, expect, test } from "vitest";
import { InMemoryAuditReader } from "../infrastructure/kysely-audit-reader.ts";
import { createListAuditEventsHandler } from "./list-audit-events/handler.ts";

describe("Fatias do módulo Auditoria (spec 005)", () => {
  test("[2.1] [2.2] [2.3] bibliotecária consulta trilha filtrada em id DESC e aluno recebe forbidden", async () => {
    const reader = new InMemoryAuditReader();
    const id1 = newUuidV7();
    const id2 = newUuidV7();
    reader.seed([
      {
        id: id1,
        occurredAt: "2026-11-10T10:00:00.000Z",
        requestId: "req-1",
        actorId: "0193b2c0-0000-7000-8000-000000000010",
        actorRole: "librarian",
        action: "work.created",
        resourceType: "work",
        resourceId: "w1",
        result: "success",
        reason: null,
        changes: { title: "DDD" },
      },
      {
        id: id2,
        occurredAt: "2026-11-10T11:00:00.000Z",
        requestId: "req-2",
        actorId: "0193b2c0-0000-7000-8000-000000000010",
        actorRole: "librarian",
        action: "fine_rate.updated",
        resourceType: "fine_rate",
        resourceId: "default",
        result: "success",
        reason: null,
        changes: { dailyRateCents: { before: 100, after: 250 } },
      },
    ]);

    const { mediator } = createInMemoryMediator();
    const listAudit = createListAuditEventsHandler(() => reader);
    expect(listAudit.name).toBe("audit.list-audit-events");
    expect(listAudit.readOnly).toBe(true);

    const student = aPrincipal({ role: "student" });
    await expect(mediator.send(listAudit, { limit: 20 }, { principal: student })).rejects.toMatchObject({
      code: "forbidden",
    });

    const lib = aPrincipal({ role: "librarian" });
    const all = await mediator.send(listAudit, { limit: 20 }, { principal: lib });
    expect(all.items.map((i) => i.id)).toEqual([id2, id1]);

    const onlyRate = await mediator.send(
      listAudit,
      { action: "fine_rate.updated", result: "success", limit: 20 },
      { principal: lib },
    );
    expect(onlyRate.items).toHaveLength(1);
    expect(onlyRate.items[0]?.id).toBe(id2);
  });
});
