import { resolve } from "node:path";
import { createManagedDatabase, type ManagedDatabase, runInUnitOfWork } from "@biblioteca/core";
import { migrateDatabase } from "@biblioteca/core/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Work } from "../domain/work.ts";
import { CATALOG_SCOPE } from "../domain/work-repository.ts";
import { kyselyWorkRepository } from "../infrastructure/kysely-work-repository.ts";
import { createInProcessCatalogFacade } from "../public/index.ts";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../../../../contracts/db/migrations");

describe("Integração SQL do módulo Acervo (PostgreSQL / PGlite)", () => {
  let managed: ManagedDatabase;

  beforeAll(async () => {
    managed = createManagedDatabase({ databaseUrl: "pglite://memory" });
    await migrateDatabase(managed, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await managed.close();
  });

  test("[2.2] [2.5] [CS-001] persiste 1000 obras, pagina por cursor sem repetir e busca em menos de 1 segundo", async () => {
    await runInUnitOfWork(managed.db, CATALOG_SCOPE, async (trx) => {
      const repo = kyselyWorkRepository(trx);
      for (let i = 0; i < 1000; i++) {
        const title = i === 420 ? "Arquitetura Limpa e DDD na Prática" : `Compêndio Universitário Volume ${i}`;
        const author = i === 420 ? "Martin Fowler" : `Autor ${i % 25}`;
        await repo.insert(Work.create({ title, authors: [author], subject: "Engenharia de Software" }).props);
      }
    });

    const t0 = performance.now();
    const match = await runInUnitOfWork(
      managed.db,
      CATALOG_SCOPE,
      (trx) => kyselyWorkRepository(trx).search({ q: "Martin Fowler", limit: 20 }),
      { readOnly: true },
    );
    const elapsedMs = performance.now() - t0;

    expect(match.items).toHaveLength(1);
    expect(match.items[0]?.title.value).toContain("Arquitetura Limpa");
    expect(elapsedMs).toBeLessThan(1000);

    // Verifica paginação com cursor no SQL real (últimos 50 registros, 2 páginas de 25)
    const p1 = await runInUnitOfWork(
      managed.db,
      CATALOG_SCOPE,
      (trx) => kyselyWorkRepository(trx).search({ limit: 25 }),
      { readOnly: true },
    );
    expect(p1.items).toHaveLength(25);
    expect(p1.nextCursor).toBeTruthy();

    const p2 = await runInUnitOfWork(
      managed.db,
      CATALOG_SCOPE,
      (trx) => kyselyWorkRepository(trx).search({ limit: 25, cursor: p1.nextCursor! }),
      { readOnly: true },
    );
    expect(p2.items).toHaveLength(25);
    const ids1 = new Set(p1.items.map((w) => w.id));
    expect(p2.items.some((w) => ids1.has(w.id))).toBe(false);

    // Garante que curingas SQL (% e _) em q são tratados literalmente
    await runInUnitOfWork(managed.db, CATALOG_SCOPE, async (trx) => {
      await kyselyWorkRepository(trx).insert(
        Work.create({ title: "Otimização 100% em SQL", authors: ["Ana SQL"], subject: "Banco_Dados" }).props,
      );
    });
    const literalPercent = await runInUnitOfWork(
      managed.db,
      CATALOG_SCOPE,
      (trx) => kyselyWorkRepository(trx).search({ q: "100%", subject: "Banco_Dados", limit: 20 }),
      { readOnly: true },
    );
    expect(literalPercent.items).toHaveLength(1);
    expect(literalPercent.items[0]?.title.value).toBe("Otimização 100% em SQL");

    // Verifica fachada pública
    const facade = createInProcessCatalogFacade(managed.db);
    const summary = await facade.getWork(match.items[0]!.id);
    expect(summary?.title).toBe("Arquitetura Limpa e DDD na Prática");
  });
});
