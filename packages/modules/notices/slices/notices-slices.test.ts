import type { CopyReturnedEventV1 } from "@biblioteca/contract";
import { newUuidV7 } from "@biblioteca/core";
import { aPrincipal, createInMemoryMediator } from "@biblioteca/core/testing";
import { describe, expect, test } from "vitest";
import { NOTICES_SCOPE } from "../domain/notice-ports.ts";
import { InMemoryEmailSender, InMemoryNoticeRepository } from "../infrastructure/notice-adapters.ts";
import { createInProcessNoticesFacade } from "../public/index.ts";
import { createDispatchNoticeHandler } from "./dispatch-notice/handler.ts";
import { createListNoticesHandler } from "./list-notices/handler.ts";

function aCopyReturnedEvent(overrides: Partial<CopyReturnedEventV1> = {}): CopyReturnedEventV1 {
  return {
    eventId: overrides.eventId ?? newUuidV7(),
    schemaVersion: 1,
    occurredAt: "2026-11-10T14:00:00.000Z",
    copyId: overrides.copyId ?? "0193b2c0-0000-7000-8000-000000000101",
    barcode: overrides.barcode ?? "EX-001",
    workId: overrides.workId ?? "0193b2c0-0000-7000-8000-000000000201",
    workTitle: overrides.workTitle ?? "Domain-Driven Design",
    assignedHold:
      overrides.assignedHold !== undefined
        ? overrides.assignedHold
        : {
            holdId: "0193b2c0-0000-7000-8000-000000000301",
            studentId: "0193b2c0-0000-7000-8000-000000000401",
            studentRegistration: "2026-0001",
            recipientEmail: "ana@alu.edu.br",
            expiresAt: "2026-11-13T23:59:59.000Z",
          },
  };
}

describe("Fatias do módulo Avisos (spec 004)", () => {
  test("define NOTICES_SCOPE como mod_notices no schema notices", () => {
    expect(NOTICES_SCOPE).toEqual({ role: "mod_notices", searchPath: "notices" });
  });

  test("[1.1] [1.2] envia e-mail único na primeira entrega e marca skipped na reentrega do mesmo holdId", async () => {
    const repo = new InMemoryNoticeRepository();
    const emailSender = new InMemoryEmailSender();
    const { mediator, audit } = createInMemoryMediator();
    const dispatch = createDispatchNoticeHandler(emailSender, () => repo);
    expect(dispatch.name).toBe("notices.dispatch-notice");

    const facade = createInProcessNoticesFacade(mediator, emailSender, () => repo);

    const first = await facade.handleCopyReturned(aCopyReturnedEvent());
    expect(first).not.toBeNull();
    expect(first?.status).toBe("sent");
    expect(first?.idempotencyKey).toBe("res-0193b2c0-0000-7000-8000-000000000301");
    expect(first?.body).toContain("2026-0001");
    expect(first?.body).toContain("EX-001");
    expect(first?.body).toContain("2026-11-13T23:59:59.000Z");
    expect(emailSender.sentMessages).toEqual([
      {
        to: "ana@alu.edu.br",
        subject: "Exemplar reservado disponível: Domain-Driven Design",
        body: first?.body,
        idempotencyKey: "res-0193b2c0-0000-7000-8000-000000000301",
      },
    ]);
    expect(audit.events.at(-1)).toMatchObject({
      action: "notice.sent",
      resourceType: "notice",
      resourceId: first?.id,
      changes: {
        holdId: "0193b2c0-0000-7000-8000-000000000301",
        idempotencyKey: "res-0193b2c0-0000-7000-8000-000000000301",
        recipientEmail: "ana@alu.edu.br",
      },
    });

    // Reentrega com novo eventId, mas mesmo holdId -> idempotente sem segundo e-mail
    const second = await facade.handleCopyReturned(aCopyReturnedEvent({ eventId: newUuidV7() }));
    expect(second?.status).toBe("skipped");
    expect(emailSender.sentMessages).toHaveLength(1);
    expect(audit.events).toHaveLength(1);
  });

  test("[1.1] ignora CopyReturned quando assignedHold é null e rejeita schemaVersion != 1", async () => {
    const repo = new InMemoryNoticeRepository();
    const emailSender = new InMemoryEmailSender();
    const { mediator } = createInMemoryMediator();
    const dispatch = createDispatchNoticeHandler(emailSender, () => repo);

    const none = await mediator.send(dispatch, aCopyReturnedEvent({ assignedHold: null }));
    expect(none).toBeNull();
    expect(emailSender.sentMessages).toHaveLength(0);

    const badVersion = { ...aCopyReturnedEvent(), schemaVersion: 2 } as unknown as CopyReturnedEventV1;
    await expect(mediator.send(dispatch, badVersion)).rejects.toMatchObject({ code: "validation-error" });
  });

  test("[2.1] [2.2] aluno vê apenas próprios avisos, bloqueia aluno sem matrícula ou matrícula alheia e bibliotecária lista tudo", async () => {
    const repo = new InMemoryNoticeRepository();
    const emailSender = new InMemoryEmailSender();
    const { mediator } = createInMemoryMediator();
    const facade = createInProcessNoticesFacade(mediator, emailSender, () => repo);
    const listNotices = createListNoticesHandler(() => repo);
    expect(listNotices.name).toBe("notices.list-notices");
    expect(listNotices.readOnly).toBe(true);

    await facade.handleCopyReturned(aCopyReturnedEvent());
    await facade.handleCopyReturned(
      aCopyReturnedEvent({
        assignedHold: {
          holdId: "0193b2c0-0000-7000-8000-000000000302",
          studentId: "0193b2c0-0000-7000-8000-000000000402",
          studentRegistration: "2026-0002",
          recipientEmail: "bruno@alu.edu.br",
          expiresAt: "2026-11-13T23:59:59.000Z",
        },
      }),
    );

    const studentNoReg = aPrincipal({ role: "student", studentRegistration: null });
    await expect(mediator.send(listNotices, { limit: 20 }, { principal: studentNoReg })).rejects.toMatchObject({
      code: "forbidden",
    });

    const ana = aPrincipal({ role: "student", studentRegistration: "2026-0001" });
    const anaPage = await mediator.send(listNotices, { limit: 20 }, { principal: ana });
    expect(anaPage.items).toHaveLength(1);
    expect(anaPage.items[0]?.studentRegistration).toBe("2026-0001");

    const anaExplicitOwn = await mediator.send(
      listNotices,
      { studentRegistration: "2026-0001", limit: 20 },
      { principal: ana },
    );
    expect(anaExplicitOwn.items).toHaveLength(1);

    await expect(
      mediator.send(listNotices, { studentRegistration: "2026-0002", limit: 20 }, { principal: ana }),
    ).rejects.toMatchObject({ code: "forbidden" });

    const lib = aPrincipal({ role: "librarian" });
    const allPage = await mediator.send(listNotices, { limit: 20 }, { principal: lib });
    expect(allPage.items).toHaveLength(2);

    const filteredLib = await mediator.send(
      listNotices,
      { studentRegistration: "2026-0002", limit: 20 },
      { principal: lib },
    );
    expect(filteredLib.items).toHaveLength(1);
    expect(filteredLib.items[0]?.recipientEmail).toBe("bruno@alu.edu.br");
  });
});
