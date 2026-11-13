// Dados iniciais idempotentes de demonstração (contas dev, 5 obras universitárias e exemplares com código de barras).
import {
  type AccountSeedInput,
  type DatabaseAuthenticator,
  type ManagedDatabase,
  runInUnitOfWork,
} from "@biblioteca/core";
import { sql } from "kysely";

export const DEMO_ACCOUNTS: readonly AccountSeedInput[] = [
  {
    id: "0193b2c0-0000-7000-8000-000000000001",
    email: "bibliotecaria@bib.edu.br",
    displayName: "Helena — Bibliotecária",
    role: "librarian",
    studentRegistration: null,
  },
  {
    id: "0193b2c0-0000-7000-8000-000000000002",
    email: "ana@alu.edu.br",
    displayName: "Ana Beatriz Silva (RA 2026-0001)",
    role: "student",
    studentRegistration: "2026-0001",
  },
  {
    id: "0193b2c0-0000-7000-8000-000000000003",
    email: "bruno@alu.edu.br",
    displayName: "Bruno Costa Oliveira (RA 2026-0002)",
    role: "student",
    studentRegistration: "2026-0002",
  },
];

export const DEMO_WORKS = [
  {
    id: "0193b2c0-0000-7100-8000-000000000001",
    title: "Domain-Driven Design: Atacando as Complexidades no Coração do Software",
    authors: ["Eric Evans"],
    subject: "Arquitetura de Software",
    isbn: "9780321125217",
    barcodes: ["DDD-001", "DDD-002"],
  },
  {
    id: "0193b2c0-0000-7100-8000-000000000002",
    title: "Arquitetura Limpa: O Guia do Artesão para Estrutura e Design de Software",
    authors: ["Robert C. Martin"],
    subject: "Engenharia de Software",
    isbn: "9780134494166",
    barcodes: ["CA-001", "CA-002"],
  },
  {
    id: "0193b2c0-0000-7100-8000-000000000003",
    title: "Refatoração: Aperfeiçoando o Design de Códigos Existentes",
    authors: ["Martin Fowler"],
    subject: "Engenharia de Software",
    isbn: "9780134757599",
    barcodes: ["REF-001"],
  },
  {
    id: "0193b2c0-0000-7100-8000-000000000004",
    title: "Designing Data-Intensive Applications",
    authors: ["Martin Kleppmann"],
    subject: "Sistemas Distribuídos",
    isbn: "9781449373320",
    barcodes: ["DDIA-001"],
  },
  {
    id: "0193b2c0-0000-7100-8000-000000000005",
    title: "Engenharia de Software Moderna",
    authors: ["Marco Tulio Valente"],
    subject: "Engenharia de Software",
    isbn: "9786500019506",
    barcodes: ["ESM-001"],
  },
] as const;

export async function ensureDemoSeed(
  managed: ManagedDatabase,
  authenticator: DatabaseAuthenticator,
  activeModules: ReadonlySet<string>,
  seedCatalogAndCopies: boolean,
): Promise<void> {
  await authenticator.ensureAccounts(DEMO_ACCOUNTS);
  if (!seedCatalogAndCopies) return;

  if (activeModules.has("catalog")) {
    await runInUnitOfWork(managed.db, { role: "mod_catalog", searchPath: "catalog" }, async (trx) => {
      const existing = await sql<{ total: string | number }>`SELECT COUNT(*)::int AS total FROM catalog.works`.execute(trx);
      if (Number(existing.rows[0]?.total ?? 0) > 0) return;

      for (const work of DEMO_WORKS) {
        await sql`
          INSERT INTO catalog.works (id, title, authors, subject, isbn, version)
          VALUES (
            ${work.id}::uuid,
            ${work.title},
            ${JSON.stringify(work.authors)}::jsonb,
            ${work.subject},
            ${work.isbn},
            1
          )
          ON CONFLICT (id) DO NOTHING
        `.execute(trx);
      }
    });
  }

  if (activeModules.has("circulation")) {
    await runInUnitOfWork(managed.db, { role: "mod_circulation", searchPath: "circulation" }, async (trx) => {
      const existing = await sql<{ total: string | number }>`SELECT COUNT(*)::int AS total FROM circulation.copies`.execute(trx);
      if (Number(existing.rows[0]?.total ?? 0) > 0) return;

      let seq = 1;
      for (const work of DEMO_WORKS) {
        for (const barcode of work.barcodes) {
          const copyId = `0193b2c0-0000-7200-8000-${String(seq++).padStart(12, "0")}`;
          await sql`
            INSERT INTO circulation.copies (id, work_id, barcode, status, version)
            VALUES (${copyId}::uuid, ${work.id}::uuid, ${barcode}, 'available', 1)
            ON CONFLICT (barcode) DO NOTHING
          `.execute(trx);
        }
      }
    });
  }
}
