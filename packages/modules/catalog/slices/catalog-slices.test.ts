import { aPrincipal, createInMemoryMediator } from "@biblioteca/core/testing";
import { describe, expect, test } from "vitest";
import { InMemoryWorkRepository } from "../infrastructure/in-memory-work-repository.ts";
import { createCreateWorkHandler } from "./create-work/handler.ts";
import { createGetWorkHandler } from "./get-work/handler.ts";
import { createSearchWorksHandler } from "./search-works/handler.ts";
import { createUpdateWorkHandler } from "./update-work/handler.ts";

describe("Fatias do módulo Acervo (spec 002)", () => {
  test("[1.1] [1.3] [1.4] cria obra, valida nome/auditoria completa, barra ISBN duplicado e recusa aluno", async () => {
    const repo = new InMemoryWorkRepository();
    const { mediator, audit } = createInMemoryMediator();
    const createWork = createCreateWorkHandler(() => repo);
    expect(createWork.name).toBe("catalog.create-work");

    const librarian = aPrincipal({ role: "librarian" });
    const student = aPrincipal({ role: "student" });

    const created = await mediator.send(
      createWork,
      {
        title: "Clean Architecture",
        authors: ["Robert C. Martin"],
        subject: "Arquitetura",
        isbn: "978-0-13-449416-6",
      },
      { principal: librarian },
    );

    expect(created.isbn?.value).toBe("9780134494166");
    expect(created.version).toBe(1);
    expect(audit.events[0]).toMatchObject({
      action: "work.created",
      resourceType: "work",
      resourceId: created.id,
      changes: {
        title: "Clean Architecture",
        authors: ["Robert C. Martin"],
        subject: "Arquitetura",
        isbn: "9780134494166",
      },
    });

    await expect(
      mediator.send(
        createWork,
        { title: "Duplicado", authors: ["Outro"], subject: "Arquitetura", isbn: "9780134494166" },
        { principal: librarian },
      ),
    ).rejects.toMatchObject({ code: "isbn-taken" });

    await expect(
      mediator.send(
        createWork,
        { title: "Nao pode", authors: ["Aluno"], subject: "Geral" },
        { principal: student },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  test("[1.5] atualiza obra com controle de versão, trata inexistente/no-op e registra diff em audit.events", async () => {
    const repo = new InMemoryWorkRepository();
    const { mediator, audit } = createInMemoryMediator();
    const createWork = createCreateWorkHandler(() => repo);
    const updateWork = createUpdateWorkHandler(() => repo);
    expect(updateWork.name).toBe("catalog.update-work");

    const librarian = aPrincipal({ role: "librarian" });

    await expect(
      mediator.send(
        updateWork,
        { workId: "0193b2c0-0000-7000-8000-000000009998", version: 1, title: "Fantasma" },
        { principal: librarian },
      ),
    ).rejects.toMatchObject({ code: "not-found", detail: "Obra não encontrada." });

    const created = await mediator.send(
      createWork,
      { title: "DDD", authors: ["Eric Evans"], subject: "Software" },
      { principal: librarian },
    );

    // Edição idempotente sem mudança real não incrementa versão nem emite auditoria
    const countBefore = audit.events.length;
    const unchanged = await mediator.send(
      updateWork,
      { workId: created.id, version: 1, title: "  DDD  " },
      { principal: librarian },
    );
    expect(unchanged.version).toBe(1);
    expect(audit.events).toHaveLength(countBefore);

    const updated = await mediator.send(
      updateWork,
      { workId: created.id, version: 1, title: "Domain-Driven Design" },
      { principal: librarian },
    );
    expect(updated.version).toBe(2);
    expect(audit.events.at(-1)).toMatchObject({
      action: "work.updated",
      resourceType: "work",
      resourceId: created.id,
      changes: { title: { before: "DDD", after: "Domain-Driven Design" } },
    });

    await expect(
      mediator.send(updateWork, { workId: created.id, version: 1, subject: "Outro" }, { principal: librarian }),
    ).rejects.toMatchObject({ code: "version-conflict", currentVersion: 2 });
  });

  test("[2.1] [2.2] [2.4] busca por título/autor, pagina por cursor sem repetições e consulta por id", async () => {
    const repo = new InMemoryWorkRepository();
    const { mediator } = createInMemoryMediator();
    const createWork = createCreateWorkHandler(() => repo);
    const searchWorks = createSearchWorksHandler(() => repo);
    const getWork = createGetWorkHandler(() => repo);
    expect(searchWorks.name).toBe("catalog.search-works");
    expect(searchWorks.readOnly).toBe(true);
    expect(getWork.name).toBe("catalog.get-work");
    expect(getWork.readOnly).toBe(true);

    const librarian = aPrincipal({ role: "librarian" });
    const student = aPrincipal({ role: "student" });

    const createdIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const w = await mediator.send(
        createWork,
        { title: `Livro ${i}`, authors: [i === 3 ? "Eric Evans" : "Outro Autor"], subject: "Computação" },
        { principal: librarian },
      );
      createdIds.push(w.id);
    }

    const filtered = await mediator.send(searchWorks, { q: "evans", limit: 20 }, { principal: student });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.title.value).toBe("Livro 3");

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await mediator.send(searchWorks, { limit: 2, cursor }, { principal: student });
      seen.push(...page.items.map((x) => x.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toEqual([...createdIds].reverse());

    const single = await mediator.send(getWork, { workId: createdIds[0]! }, { principal: student });
    expect(single.title.value).toBe("Livro 1");

    await expect(
      mediator.send(getWork, { workId: "0193b2c0-0000-7000-8000-000000009999" }, { principal: student }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Obra não encontrada no catálogo." });
  });
});
