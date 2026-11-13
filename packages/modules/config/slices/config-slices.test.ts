import { aPrincipal, createInMemoryMediator } from "@biblioteca/core/testing";
import { describe, expect, test } from "vitest";
import { InMemoryFineRateRepository } from "../infrastructure/fine-rate-repository.ts";
import { createGetFineRateHandler } from "./get-fine-rate/handler.ts";
import { createUpdateFineRateHandler } from "./update-fine-rate/handler.ts";

describe("Fatias do módulo Configuração (spec 005)", () => {
  test("[1.1] [1.2] [1.3] [1.4] consulta valor padrão, trata no-op, atualiza com auditoria completa e bloqueia aluno/versão antiga", async () => {
    const repo = new InMemoryFineRateRepository();
    const { mediator, audit } = createInMemoryMediator();
    const getFineRate = createGetFineRateHandler(() => repo);
    const updateFineRate = createUpdateFineRateHandler(() => repo);
    expect(getFineRate.name).toBe("config.get-fine-rate");
    expect(getFineRate.readOnly).toBe(true);
    expect(updateFineRate.name).toBe("config.update-fine-rate");

    const librarian = aPrincipal({ role: "librarian" });
    const student = aPrincipal({ role: "student" });

    const initial = await mediator.send(getFineRate, {}, { principal: student });
    expect(initial.dailyRateCents).toBe(100);
    expect(initial.version).toBe(1);

    await expect(
      mediator.send(updateFineRate, { dailyRateCents: 300, version: 1 }, { principal: student }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // No-op com mesmo valor não gera evento de auditoria nem altera versão
    const countBeforeNoop = audit.events.length;
    const noop = await mediator.send(updateFineRate, { dailyRateCents: 100, version: 1 }, { principal: librarian });
    expect(noop.version).toBe(1);
    expect(audit.events).toHaveLength(countBeforeNoop);

    const updated = await mediator.send(updateFineRate, { dailyRateCents: 250, version: 1 }, { principal: librarian });
    expect(updated.dailyRateCents).toBe(250);
    expect(updated.version).toBe(2);
    expect(audit.events.at(-1)).toMatchObject({
      action: "fine_rate.updated",
      resourceType: "fine_rate",
      resourceId: "default",
      changes: { dailyRateCents: { before: 100, after: 250 } },
    });

    await expect(
      mediator.send(updateFineRate, { dailyRateCents: 500, version: 1 }, { principal: librarian }),
    ).rejects.toMatchObject({ code: "version-conflict", currentVersion: 2 });
  });
});
