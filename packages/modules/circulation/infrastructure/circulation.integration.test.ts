import { resolve } from "node:path";
import {
  createManagedDatabase,
  type ManagedDatabase,
  Mediator,
  newUuidV7,
  runInUnitOfWork,
} from "@biblioteca/core";
import { migrateDatabase } from "@biblioteca/core/migrator";
import { aPrincipal } from "@biblioteca/core/testing";
import { createInProcessCatalogFacade } from "@biblioteca/module-catalog/public";
import { createInProcessConfigHandlers, createInProcessFineRateFacade } from "@biblioteca/module-config/public";
import { createInProcessNoticesFacade, type EmailMessage } from "@biblioteca/module-notices/public";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { CIRCULATION_SCOPE } from "../domain/ports.ts";
import { FixedClock } from "../domain/value-objects.ts";
import { InMemoryAcademicRegistry } from "../infrastructure/academic-translator.ts";
import { ConformistCalendarClient, generateAcademicDaysRange } from "../infrastructure/calendar-client.ts";
import { kyselyCirculationRepository } from "../infrastructure/kysely-circulation-repo.ts";
import { createGetStudentSummaryHandler } from "../slices/get-student-summary/handler.ts";
import { createLendCopyHandler } from "../slices/lend-copy/handler.ts";
import { createPlaceHoldHandler } from "../slices/place-hold/handler.ts";
import { createRegisterCopyHandler } from "../slices/register-copy/handler.ts";
import { createReturnCopyHandler } from "../slices/return-copy/handler.ts";
import type { CirculationDeps } from "../slices/shared.ts";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../../../../contracts/db/migrations");

async function seedWork(db: ManagedDatabase["db"], title: string, author: string): Promise<string> {
  const id = newUuidV7();
  await runInUnitOfWork(db, { role: "mod_catalog", searchPath: "catalog" }, async (trx) => {
    await sql`
      INSERT INTO catalog.works (id, title, authors, subject, isbn, version)
      VALUES (${id}::uuid, ${title}, ${JSON.stringify([author])}::jsonb, 'Engenharia de Software', NULL, 1)
    `.execute(trx);
  });
  return id;
}

describe("Integração SQL do módulo Circulação (concorrência, atomicidade e fluxos multi-módulo)", () => {
  let managed: ManagedDatabase;

  beforeEach(async () => {
    managed = createManagedDatabase({ databaseUrl: "pglite://memory" });
    await migrateDatabase(managed, MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await managed.close();
  });

  test("[1.6] duas chamadas concorrentes lendCopy para o mesmo exemplar: apenas uma vence", async () => {
    const mediator = new Mediator({ db: managed.db });
    const lib = aPrincipal({ role: "librarian" });
    const clock = new FixedClock("2026-11-10T10:00:00.000Z");

    const workId = await seedWork(managed.db, "Concorrência em Bancos", "Martin Kleppmann");

    const deps: CirculationDeps = {
      catalog: createInProcessCatalogFacade(managed.db),
      config: createInProcessFineRateFacade(managed.db),
      notices: createInProcessNoticesFacade(mediator, { send: async () => undefined }),
      academicRegistry: new InMemoryAcademicRegistry(),
      calendar: new ConformistCalendarClient({ dias_letivos: generateAcademicDaysRange(2026, 2027) }),
      clock,
    };

    await mediator.send(createRegisterCopyHandler(deps), { workId, barcode: "CONC-01" }, { principal: lib });

    const lend = createLendCopyHandler(deps);
    const results = await Promise.allSettled([
      mediator.send(lend, { studentRegistration: "2026-0001", barcode: "CONC-01" }, { principal: lib }),
      mediator.send(lend, { studentRegistration: "2026-0002", barcode: "CONC-01" }, { principal: lib }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  test("[1.2] [RN-02] dois pedidos ao mesmo tempo para o aluno com 2 em aberto: a versão do Student barra o segundo, que refaz e é recusado", async () => {
    const mediator = new Mediator({ db: managed.db });
    const lib = aPrincipal({ role: "librarian" });
    const clock = new FixedClock("2026-11-10T10:00:00.000Z");
    const workId = await seedWork(managed.db, "Domain-Driven Design", "Eric Evans");

    const deps: CirculationDeps = {
      catalog: createInProcessCatalogFacade(managed.db),
      config: createInProcessFineRateFacade(managed.db),
      notices: createInProcessNoticesFacade(mediator, { send: async () => undefined }),
      academicRegistry: new InMemoryAcademicRegistry(),
      calendar: new ConformistCalendarClient({ dias_letivos: generateAcademicDaysRange(2026, 2027) }),
      clock,
    };
    const register = createRegisterCopyHandler(deps);
    const lend = createLendCopyHandler(deps);
    for (const barcode of ["AGR-1", "AGR-2", "AGR-3", "AGR-4"]) {
      await mediator.send(register, { workId, barcode }, { principal: lib });
    }
    const totemCopy = await runInUnitOfWork(managed.db, CIRCULATION_SCOPE, (trx) =>
      kyselyCirculationRepository(trx).findCopyByBarcode("AGR-4"),
    );
    await mediator.send(lend, { studentRegistration: "2026-0001", barcode: "AGR-1" }, { principal: lib });
    const second = await mediator.send(lend, { studentRegistration: "2026-0001", barcode: "AGR-2" }, { principal: lib });

    // O totem lê o Student: 2 em aberto
    const readByTotem = await runInUnitOfWork(managed.db, CIRCULATION_SCOPE, (trx) =>
      kyselyCirculationRepository(trx).loadStudent(second.studentId),
    );
    expect(readByTotem?.openLoans).toHaveLength(2);

    // O balcão empresta o 3º antes de o totem gravar: a versão do Student sobe
    await mediator.send(lend, { studentRegistration: "2026-0001", barcode: "AGR-3" }, { principal: lib });

    // O totem pede à raiz com o que leu (2 em aberto, a raiz aceita) e tenta gravar com a versão lida: recusado
    const byTotem = readByTotem!.borrow(
      { copyId: totemCopy!.id, workId, loanDate: "2026-11-10", dueDate: "2026-11-30" },
      clock.nowIso(),
    );
    await expect(
      runInUnitOfWork(managed.db, CIRCULATION_SCOPE, (trx) =>
        kyselyCirculationRepository(trx).saveStudent(byTotem.student, readByTotem!.props.version),
      ),
    ).rejects.toMatchObject({ code: "version-conflict", currentVersion: readByTotem!.props.version + 1 });

    // Nada muda: continuam 3 em aberto; o totem refaz, a raiz conta 3 e recusa
    const afterConflict = await runInUnitOfWork(managed.db, CIRCULATION_SCOPE, (trx) =>
      kyselyCirculationRepository(trx).loadStudent(second.studentId),
    );
    expect(afterConflict?.openLoans).toHaveLength(3);
    await expect(
      mediator.send(lend, { studentRegistration: "2026-0001", barcode: "AGR-4" }, { principal: lib }),
    ).rejects.toMatchObject({ code: "loan-limit-reached" });
  });

  test("[2.2] [1.3 spec 004] [1.5 spec 005] falha ao gravar multa faz rollback total e preserva afterCommit; tarifa antiga fica imutável", async () => {
    const sentMessages: EmailMessage[] = [];
    const emailSender = {
      send: async (msg: EmailMessage) => {
        sentMessages.push(msg);
      },
    };
    const mediator = new Mediator({ db: managed.db });
    const lib = aPrincipal({ role: "librarian" });
    const bruno = aPrincipal({ role: "student", studentRegistration: "2026-0002" });
    const clock = new FixedClock("2026-11-10T10:00:00.000Z");

    const workId = await seedWork(managed.db, "Refactoring", "Martin Fowler");

    const baseDeps: CirculationDeps = {
      catalog: createInProcessCatalogFacade(managed.db),
      config: createInProcessFineRateFacade(managed.db),
      notices: createInProcessNoticesFacade(mediator, emailSender),
      academicRegistry: new InMemoryAcademicRegistry(),
      calendar: new ConformistCalendarClient({ dias_letivos: generateAcademicDaysRange(2026, 2027) }),
      clock,
    };

    await mediator.send(createRegisterCopyHandler(baseDeps), { workId, barcode: "REF-01" }, { principal: lib });
    const loan1 = await mediator.send(
      createLendCopyHandler(baseDeps),
      { studentRegistration: "2026-0001", barcode: "REF-01" },
      { principal: lib },
    );

    // Bruno reserva para forçar também tentativa de agendar afterCommit caso a transação não falhasse
    await mediator.send(createPlaceHoldHandler(baseDeps), { workId }, { principal: bruno });

    // Avança 2 dias após o vencimento
    clock.setNow(`${loan1.dueDate}T12:00:00.000Z`);
    clock.advanceDays(2);

    // Repositório que falha exatamente ao tentar inserir a multa (após UPDATE loan -> returned)
    const failingDeps: CirculationDeps = {
      ...baseDeps,
      repositoryFor: (trx) => {
        const inner = kyselyCirculationRepository(trx);
        return {
          ...inner,
          insertFine: async () => {
            throw new Error("falha simulada ao gravar multa");
          },
          upsertStudentFromAcademic: (a, t) => inner.upsertStudentFromAcademic(a, t),
          findStudentById: (id) => inner.findStudentById(id),
          findStudentByRegistration: (reg) => inner.findStudentByRegistration(reg),
          loadStudent: (sid) => inner.loadStudent(sid),
          saveStudent: (st, v) => inner.saveStudent(st, v),
          insertCopy: (c) => inner.insertCopy(c),
          findCopyById: (id) => inner.findCopyById(id),
          findCopiesByIds: (ids) => inner.findCopiesByIds(ids),
          findCopyByBarcode: (b) => inner.findCopyByBarcode(b),
          updateCopyWithVersion: (c, v) => inner.updateCopyWithVersion(c, v),
          listCopies: (f) => inner.listCopies(f),
          countByWork: (w) => inner.countByWork(w),
          findLoanById: (id) => inner.findLoanById(id),
          findOpenLoanByCopyId: (cid) => inner.findOpenLoanByCopyId(cid),
          updateLoanWithVersion: (l, v) => inner.updateLoanWithVersion(l, v),
          listOpenLoansByStudent: (sid) => inner.listOpenLoansByStudent(sid),
          findFineById: (fid) => inner.findFineById(fid),
          updateFineWithVersion: (f, v) => inner.updateFineWithVersion(f, v),
          listFinesByStudent: (sid) => inner.listFinesByStudent(sid),
          insertHold: (h) => inner.insertHold(h),
          findHoldById: (hid) => inner.findHoldById(hid),
          updateHoldWithVersion: (h, v) => inner.updateHoldWithVersion(h, v),
          hasActiveHold: (sid, wid) => inner.hasActiveHold(sid, wid),
          hasWaitingHoldForWork: (wid) => inner.hasWaitingHoldForWork(wid),
          findNextWaitingHoldFifo: (wid) => inner.findNextWaitingHoldFifo(wid),
          listActiveHoldsByStudent: (sid) => inner.listActiveHoldsByStudent(sid),
          listHoldsByStudent: (sid) => inner.listHoldsByStudent(sid),
        };
      },
    };

    await expect(
      mediator.send(createReturnCopyHandler(failingDeps), { barcode: "REF-01" }, { principal: lib }),
    ).rejects.toThrowError(/falha simulada/);

    // Prova que o empréstimo continua open e NENHUM e-mail foi enviado pós-rollback!
    expect(sentMessages).toHaveLength(0);
    const summaryDuringRollback = await mediator.send(
      createGetStudentSummaryHandler(baseDeps),
      { registration: "2026-0001" },
      { principal: lib },
    );
    expect(summaryDuringRollback.openLoans).toHaveLength(1);
    expect(summaryDuringRollback.fines).toHaveLength(0);

    // Agora devolve sem falha usando tarifa inicial de 100 centavos/dia -> gera multa de 200 centavos e envia 1 e-mail para Bruno
    const res1 = await mediator.send(createReturnCopyHandler(baseDeps), { barcode: "REF-01" }, { principal: lib });
    expect(res1.fine?.dailyRateCents).toBe(100);
    expect(res1.fine?.amountCents).toBe(200);
    expect(res1.assignedHold?.status).toBe("ready");
    expect(sentMessages).toHaveLength(1);

    // Atualiza tarifa diária no Config para 250 centavos/dia e garante que a multa anterior de Ana continuou 200 centavos
    const { updateFineRate } = createInProcessConfigHandlers();
    await mediator.send(updateFineRate, { dailyRateCents: 250, version: 1 }, { principal: lib });

    const anaSummaryAfterConfig = await mediator.send(
      createGetStudentSummaryHandler(baseDeps),
      { registration: "2026-0001" },
      { principal: lib },
    );
    expect(anaSummaryAfterConfig.fines[0]?.dailyRateCents).toBe(100);
    expect(anaSummaryAfterConfig.fines[0]?.amountCents).toBe(200);
    expect(CIRCULATION_SCOPE.role).toBe("mod_circulation");
  });
});
