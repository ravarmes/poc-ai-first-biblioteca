import type { CopyReturnedEventV1, InternalWorkSummary } from "@biblioteca/contract";
import { Mediator, newUuidV7 } from "@biblioteca/core";
import { aPrincipal, createInMemoryMediator, InMemoryAuditRecorder } from "@biblioteca/core/testing";
import type { Kysely } from "kysely";
import { describe, expect, test } from "vitest";
import { FixedClock } from "../domain/value-objects.ts";
import { InMemoryAcademicRegistry } from "../infrastructure/academic-translator.ts";
import { ConformistCalendarClient } from "../infrastructure/calendar-client.ts";
import { InMemoryCirculationRepository } from "../infrastructure/in-memory-circulation-repo.ts";
import { createExpireHoldHandler } from "./expire-hold/handler.ts";
import { createGetStudentSummaryHandler } from "./get-student-summary/handler.ts";
import { createLendCopyHandler } from "./lend-copy/handler.ts";
import { createListCopiesHandler } from "./list-copies/handler.ts";
import { createPayFineHandler } from "./pay-fine/handler.ts";
import { createPlaceHoldHandler } from "./place-hold/handler.ts";
import { createRegisterCopyHandler } from "./register-copy/handler.ts";
import { createRenewLoanHandler } from "./renew-loan/handler.ts";
import { createRetireCopyHandler } from "./retire-copy/handler.ts";
import { createReturnCopyHandler } from "./return-copy/handler.ts";
import type { CirculationDeps } from "./shared.ts";
import { createWithdrawReservedCopyHandler } from "./withdraw-reserved-copy/handler.ts";
import { createWorkAvailabilityHandler } from "./work-availability/handler.ts";

function buildTestHarness(initialNow = "2026-11-10T10:00:00.000Z") {
  const repo = new InMemoryCirculationRepository();
  const clock = new FixedClock(initialNow);
  const works = new Map<string, InternalWorkSummary>();
  const deliveredEvents: CopyReturnedEventV1[] = [];
  let fineRateCents = 100;

  const work1: InternalWorkSummary = {
    id: newUuidV7(),
    title: "Domain-Driven Design",
    authors: ["Eric Evans"],
    subject: "Arquitetura de Software",
    isbn: "9780321125217",
  };
  const work2: InternalWorkSummary = {
    id: newUuidV7(),
    title: "Clean Architecture",
    authors: ["Robert C. Martin"],
    subject: "Engenharia de Software",
    isbn: null,
  };
  works.set(work1.id, work1);
  works.set(work2.id, work2);

  // Dias letivos suficientes de nov/2026 a jan/2027 (pula sábados/domingos)
  const schoolDays: string[] = [];
  const start = Date.UTC(2026, 10, 2);
  for (let i = 0; i < 90; i++) {
    const d = new Date(start + i * 86_400_000);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) schoolDays.push(d.toISOString().slice(0, 10));
  }

  const deps: CirculationDeps = {
    catalog: {
      getWork: async (id) => works.get(id) ?? null,
      getWorksByIds: async (ids) => {
        const m = new Map<string, InternalWorkSummary>();
        for (const id of ids) {
          const found = works.get(id);
          if (found) m.set(id, found);
        }
        return m;
      },
    },
    config: {
      currentDailyRateCents: async () => fineRateCents,
    },
    notices: {
      handleCopyReturned: async (event) => {
        deliveredEvents.push(event);
        return null;
      },
    },
    academicRegistry: new InMemoryAcademicRegistry(),
    calendar: new ConformistCalendarClient({ dias_letivos: schoolDays }),
    clock,
    repositoryFor: () => repo,
  };

  const { mediator, audit } = createInMemoryMediator();
  return {
    deps,
    mediator,
    audit,
    repo,
    clock,
    works,
    work1,
    work2,
    deliveredEvents,
    setRateCents: (cents: number) => {
      fineRateCents = cents;
    },
  };
}

describe("Fatias verticais do módulo Circulação (spec 003)", () => {
  test("[1.1]-[1.5] [5.1] [5.2] cadastra exemplares, empresta 3, bloqueia 4º/trancado/indisponível e dá baixa", async () => {
    const { deps, mediator, audit, works, work1, work2 } = buildTestHarness("2026-11-10T10:00:00.000Z");
    const lib = aPrincipal({ role: "librarian" });
    const student = aPrincipal({ role: "student" });

    const registerCopy = createRegisterCopyHandler(deps);
    const retireCopy = createRetireCopyHandler(deps);
    const listCopies = createListCopiesHandler(deps);
    const lendCopy = createLendCopyHandler(deps);

    expect(registerCopy.name).toBe("circulation.register-copy");
    expect(retireCopy.name).toBe("circulation.retire-copy");
    expect(listCopies.name).toBe("circulation.list-copies");
    expect(listCopies.readOnly).toBe(true);
    expect(lendCopy.name).toBe("circulation.lend-copy");

    // Obra e exemplar inexistentes falham com not-found e detalhe claro
    await expect(
      mediator.send(registerCopy, { workId: newUuidV7(), barcode: "EX-999" }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Obra não encontrada no catálogo para vincular exemplar." });

    await expect(
      mediator.send(lendCopy, { studentRegistration: "2026-0001", barcode: "EX-404" }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Exemplar com código de barras 'EX-404' não encontrado." });

    await expect(
      mediator.send(retireCopy, { copyId: newUuidV7(), version: 1 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Exemplar não encontrado." });

    const c1 = await mediator.send(registerCopy, { workId: work1.id, barcode: "ex-01" }, { principal: lib });
    expect(audit.events.at(-1)).toMatchObject({
      action: "copy.registered",
      resourceType: "copy",
      resourceId: c1.id,
      changes: { workId: work1.id, barcode: "EX-01", status: "available" },
    });

    const c2 = await mediator.send(registerCopy, { workId: work1.id, barcode: "EX-02" }, { principal: lib });
    const c3 = await mediator.send(registerCopy, { workId: work2.id, barcode: "EX-03" }, { principal: lib });
    const c4 = await mediator.send(registerCopy, { workId: work2.id, barcode: "EX-04" }, { principal: lib });
    const c5 = await mediator.send(registerCopy, { workId: work2.id, barcode: "EX-05" }, { principal: lib });

    expect(c1.barcode).toBe("EX-01");
    await expect(
      mediator.send(registerCopy, { workId: work1.id, barcode: "EX-01" }, { principal: lib }),
    ).rejects.toMatchObject({ code: "barcode-taken" });

    const listed = await mediator.send(listCopies, { workId: work1.id, limit: 20 }, { principal: student });
    expect(listed.items).toHaveLength(2);
    expect(listed.items[0]?.workTitle).toBe("Domain-Driven Design");

    // Aluno não pode emprestar no balcão
    await expect(
      mediator.send(lendCopy, { studentRegistration: "2026-0001", barcode: "EX-01" }, { principal: student }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // Matrícula trancada na Secretaria bloqueia sem gravar aluno local
    await expect(
      mediator.send(lendCopy, { studentRegistration: "2026-0003", barcode: "EX-01" }, { principal: lib }),
    ).rejects.toMatchObject({ code: "student-inactive" });

    // Aluno ativo empresta 3 exemplares -> vencimento em 14 dias letivos (2026-11-30)
    const l1 = await mediator.send(
      lendCopy,
      { studentRegistration: "2026-0001", barcode: "EX-01" },
      { principal: lib },
    );
    expect(l1.status).toBe("open");
    expect(l1.dueDate).toBe("2026-11-30");
    expect(l1.workTitle).toBe("Domain-Driven Design");
    expect(audit.events.at(-1)).toMatchObject({
      action: "loan.created",
      resourceType: "loan",
      resourceId: l1.id,
      changes: { barcode: "EX-01", studentRegistration: "2026-0001", dueDate: "2026-11-30" },
    });

    // Tentar emprestar o mesmo exemplar já emprestado -> invalid-copy-state
    await expect(
      mediator.send(lendCopy, { studentRegistration: "2026-0002", barcode: "EX-01" }, { principal: lib }),
    ).rejects.toMatchObject({ code: "invalid-copy-state" });

    // Não pode dar baixa em exemplar emprestado
    await expect(mediator.send(retireCopy, { copyId: c1.id, version: 2 }, { principal: lib })).rejects.toMatchObject({
      code: "invalid-copy-state",
    });

    // Dá baixa definitiva em EX-05 disponível, registra auditoria e bloqueia empréstimo dele
    const retired = await mediator.send(retireCopy, { copyId: c5.id, version: 1 }, { principal: lib });
    expect(retired.status).toBe("retired");
    expect(audit.events.at(-1)).toMatchObject({
      action: "copy.retired",
      resourceType: "copy",
      resourceId: c5.id,
      changes: { barcode: "EX-05", status: { before: "available", after: "retired" } },
    });
    await expect(
      mediator.send(lendCopy, { studentRegistration: "2026-0002", barcode: "EX-05" }, { principal: lib }),
    ).rejects.toMatchObject({ code: "invalid-copy-state" });

    // Completa 3 empréstimos para Ana e bloqueia o 4º
    await mediator.send(lendCopy, { studentRegistration: "2026-0001", barcode: "EX-02" }, { principal: lib });
    await mediator.send(lendCopy, { studentRegistration: "2026-0001", barcode: "EX-03" }, { principal: lib });
    await expect(
      mediator.send(lendCopy, { studentRegistration: "2026-0001", barcode: "EX-04" }, { principal: lib }),
    ).rejects.toMatchObject({ code: "loan-limit-reached" });
    expect(c4.status).toBe("available");

    // Paginação de listCopies e fallback quando work foi removido do catálogo em cache
    const page1 = await mediator.send(listCopies, { status: "on-loan", limit: 2 }, { principal: lib });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    works.delete(work1.id);
    const listedFallback = await mediator.send(listCopies, { workId: work1.id, limit: 20 }, { principal: student });
    expect(listedFallback.items.every((c) => c.workTitle === "Obra não identificada")).toBe(true);
  });

  test("[2.1]-[2.4] [5.3] [5.4] devolução no prazo/atraso, resumo completo do aluno, fallback de obra ausente e quitação", async () => {
    const { deps, mediator, audit, clock, works, work1, setRateCents } = buildTestHarness("2026-11-10T10:00:00.000Z");
    const lib = aPrincipal({ role: "librarian" });
    const anaPrincipal = aPrincipal({ role: "student", studentRegistration: "2026-0001" });
    const noRegPrincipal = aPrincipal({ role: "student", studentRegistration: null });

    const registerCopy = createRegisterCopyHandler(deps);
    const lendCopy = createLendCopyHandler(deps);
    const returnCopy = createReturnCopyHandler(deps);
    const payFine = createPayFineHandler(deps);
    const summaryHandler = createGetStudentSummaryHandler(deps);
    expect(returnCopy.name).toBe("circulation.return-copy");
    expect(payFine.name).toBe("circulation.pay-fine");
    expect(summaryHandler.name).toBe("circulation.get-student-summary");

    // Aluno ainda não cadastrado localmente, mas existente na Secretaria -> cria via upsert e retorna resumo vazio
    const firstTimeSummary = await mediator.send(
      summaryHandler,
      { registration: "2026-0002" },
      { principal: lib },
    );
    expect(firstTimeSummary).toMatchObject({
      registration: "2026-0002",
      name: "Bruno Costa Oliveira",
      email: "bruno@alu.edu.br",
      activeLoansCount: 0,
      loanLimit: 3,
      openLoans: [],
      holds: [],
      fines: [],
    });

    // Aluno inexistente tanto localmente quanto na Secretaria -> not-found
    await expect(
      mediator.send(summaryHandler, { registration: "9999-9999" }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Aluno com matrícula '9999-9999' não encontrado." });

    // Student sem studentRegistration no principal -> forbidden
    await expect(
      mediator.send(summaryHandler, { registration: "2026-0001" }, { principal: noRegPrincipal }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // Devolver barcode inexistente / pagar multa inexistente -> not-found
    await expect(mediator.send(returnCopy, { barcode: "EX-404" }, { principal: lib })).rejects.toMatchObject({
      code: "not-found",
      detail: "Exemplar com código de barras 'EX-404' não encontrado.",
    });
    await expect(
      mediator.send(payFine, { fineId: newUuidV7(), version: 1 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Multa não encontrada." });

    await mediator.send(registerCopy, { workId: work1.id, barcode: "EX-10" }, { principal: lib });
    await mediator.send(registerCopy, { workId: work1.id, barcode: "EX-11" }, { principal: lib });

    // Tentar devolver exemplar disponível -> no-active-loan
    await expect(mediator.send(returnCopy, { barcode: "EX-10" }, { principal: lib })).rejects.toMatchObject({
      code: "no-active-loan",
    });

    await mediator.send(lendCopy, { studentRegistration: "2026-0001", barcode: "EX-10" }, { principal: lib });
    await mediator.send(lendCopy, { studentRegistration: "2026-0001", barcode: "EX-11" }, { principal: lib });

    // Resumo antes da devolução lista os 2 empréstimos com código de barras e título da obra
    const anaMidSummary = await mediator.send(
      summaryHandler,
      { registration: " 2026-0001 " },
      { principal: anaPrincipal },
    );
    expect(anaMidSummary.activeLoansCount).toBe(2);
    expect(anaMidSummary.openLoans[0]?.barcode).toBeTruthy();
    expect(anaMidSummary.openLoans[0]?.workTitle).toBe("Domain-Driven Design");

    // Devolve EX-10 no prazo -> sem multa, volta para available e registra fineAmountCents/assignedHoldId nulos na auditoria
    clock.setNow("2026-11-20T14:00:00.000Z");
    const okReturn = await mediator.send(returnCopy, { barcode: "EX-10" }, { principal: lib });
    expect(okReturn.fine).toBeNull();
    expect(okReturn.assignedHold).toBeNull();
    expect(okReturn.copy.status).toBe("available");
    expect(okReturn.loan.status).toBe("returned");
    expect(okReturn.loan.workTitle).toBe("Domain-Driven Design");
    expect(audit.events.at(-1)).toMatchObject({
      action: "copy.returned",
      resourceType: "copy",
      resourceId: okReturn.copy.id,
      changes: {
        barcode: "EX-10",
        loanId: okReturn.loan.id,
        copyStatus: "available",
        fineAmountCents: null,
        assignedHoldId: null,
      },
    });

    // Tarifa atualizada para 250 centavos/dia; devolve EX-11 3 dias após 2026-11-30 (= 2026-12-03)
    setRateCents(250);
    clock.setNow("2026-12-03T15:00:00.000Z");
    const lateReturn = await mediator.send(returnCopy, { barcode: "EX-11" }, { principal: lib });
    expect(lateReturn.fine).not.toBeNull();
    expect(lateReturn.fine?.overdueDays).toBe(3);
    expect(lateReturn.fine?.dailyRateCents).toBe(250);
    expect(lateReturn.fine?.amountCents).toBe(750);
    expect(audit.events.at(-1)).toMatchObject({
      action: "copy.returned",
      changes: { fineAmountCents: 750, assignedHoldId: null },
    });

    // Aluno bloqueado por multa pendente: a recusa diz quanto ele deve (RN-01)
    await expect(
      mediator.send(lendCopy, { studentRegistration: "2026-0001", barcode: "EX-10" }, { principal: lib }),
    ).rejects.toMatchObject({ code: "pending-fine", detail: expect.stringContaining("R$ 7,50") });

    // Outro aluno tentando consultar resumo de Ana -> forbidden
    const brunoPrincipal = aPrincipal({ role: "student", studentRegistration: "2026-0002" });
    await expect(
      mediator.send(summaryHandler, { registration: "2026-0001" }, { principal: brunoPrincipal }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // Ana consulta próprio resumo e vê a multa
    const summaryBefore = await mediator.send(summaryHandler, { registration: "2026-0001" }, { principal: anaPrincipal });
    expect(summaryBefore.fines).toHaveLength(1);
    expect(summaryBefore.fines[0]?.status).toBe("pending");

    // Bibliotecária quita a multa com auditoria completa e Ana volta a poder emprestar
    const paid = await mediator.send(payFine, { fineId: lateReturn.fine!.id, version: 1 }, { principal: lib });
    expect(paid.status).toBe("paid");
    expect(audit.events.at(-1)).toMatchObject({
      action: "fine.paid",
      resourceType: "fine",
      resourceId: paid.id,
      changes: { amountCents: 750, status: { before: "pending", after: "paid" } },
    });

    const newLoan = await mediator.send(
      lendCopy,
      { studentRegistration: "2026-0001", barcode: "EX-10" },
      { principal: lib },
    );
    expect(newLoan.status).toBe("open");

    // Com obra removida do catálogo, fallback 'Obra não identificada' aparece em summary e returnCopy
    works.delete(work1.id);
    const fallbackSummary = await mediator.send(summaryHandler, { registration: "2026-0001" }, { principal: anaPrincipal });
    expect(fallbackSummary.openLoans[0]?.workTitle).toBe("Obra não identificada");
    const fallbackReturn = await mediator.send(returnCopy, { barcode: "EX-10" }, { principal: lib });
    expect(fallbackReturn.copy.workTitle).toBe("Obra não identificada");
  });

  test("[3.1]-[3.4] [4.1]-[4.4] fila FIFO de reserva, expiração com e sem próximo da fila, renovação e disponibilidade", async () => {
    const { deps, mediator, audit, clock, works, work1, work2, deliveredEvents } = buildTestHarness(
      "2026-11-10T10:00:00.000Z",
    );
    const lib = aPrincipal({ role: "librarian" });
    const ana = aPrincipal({ role: "student", studentRegistration: "2026-0001" });
    const bruno = aPrincipal({ role: "student", studentRegistration: "2026-0002" });
    const studentNoReg = aPrincipal({ role: "student", studentRegistration: null });

    // Adiciona um terceiro aluno ativo na Secretaria para testar empréstimo com fila de 2 reservantes
    const registry = deps.academicRegistry as InMemoryAcademicRegistry;
    registry.putRawRecord({
      ra: "2026-0004",
      nome_civil: "Diego Ferreira",
      sit_matricula: "MATRICULADO",
      cod_curso: "CC-01",
      email_institucional: "diego@alu.edu.br",
    });

    const registerCopy = createRegisterCopyHandler(deps);
    const retireCopy = createRetireCopyHandler(deps);
    const availability = createWorkAvailabilityHandler(deps);
    const lendCopy = createLendCopyHandler(deps);
    const renewLoan = createRenewLoanHandler(deps);
    const placeHold = createPlaceHoldHandler(deps);
    const returnCopy = createReturnCopyHandler(deps);
    const withdrawHold = createWithdrawReservedCopyHandler(deps);
    const expireHold = createExpireHoldHandler(deps);
    const summaryHandler = createGetStudentSummaryHandler(deps);

    expect(availability.name).toBe("circulation.work-availability");
    expect(availability.readOnly).toBe(true);
    expect(renewLoan.name).toBe("circulation.renew-loan");
    expect(placeHold.name).toBe("circulation.place-hold");
    expect(withdrawHold.name).toBe("circulation.withdraw-reserved-copy");
    expect(expireHold.name).toBe("circulation.expire-hold");

    // Erros 404 iniciais em availability, placeHold, renewLoan, withdrawHold, expireHold
    await expect(mediator.send(availability, { workId: newUuidV7() }, { principal: ana })).rejects.toMatchObject({
      code: "not-found",
      detail: "Obra não encontrada no catálogo.",
    });
    await expect(mediator.send(placeHold, { workId: newUuidV7() }, { principal: ana })).rejects.toMatchObject({
      code: "not-found",
      detail: "Obra não encontrada no catálogo.",
    });
    // Aluno consultando renewLoan de loan inexistente recebe 404 (não 403 mascarado)
    await expect(
      mediator.send(renewLoan, { loanId: newUuidV7(), version: 1 }, { principal: ana }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Empréstimo não encontrado." });
    await expect(
      mediator.send(withdrawHold, { holdId: newUuidV7(), version: 1 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Reserva não encontrada." });
    await expect(
      mediator.send(expireHold, { holdId: newUuidV7(), version: 1 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Reserva não encontrada." });

    // Obra sem nenhum exemplar circulante -> canPlaceHold false e placeHold rejeita invalid-copy-state
    const emptyAv = await mediator.send(availability, { workId: work1.id }, { principal: ana });
    expect(emptyAv.totalCopies).toBe(0);
    expect(emptyAv.canPlaceHold).toBe(false);
    await expect(mediator.send(placeHold, { workId: work1.id }, { principal: ana })).rejects.toMatchObject({
      code: "invalid-copy-state",
      detail: "Esta obra não possui exemplares circulantes ativos para reserva.",
    });

    // Bibliotecária omitindo matrícula falha em validation-error; aluno sem matrícula ou matrícula de outro falha com forbidden
    await expect(mediator.send(placeHold, { workId: work1.id }, { principal: lib })).rejects.toMatchObject({
      code: "validation-error",
      detail: "Informe a matrícula do aluno para registrar a reserva.",
    });
    await expect(mediator.send(placeHold, { workId: work1.id }, { principal: studentNoReg })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      mediator.send(placeHold, { workId: work1.id, studentRegistration: "2026-0002" }, { principal: ana }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await mediator.send(registerCopy, { workId: work1.id, barcode: "EX-20" }, { principal: lib });
    const retiredCopy = await mediator.send(registerCopy, { workId: work1.id, barcode: "EX-20B" }, { principal: lib });
    await mediator.send(retireCopy, { copyId: retiredCopy.id, version: 1 }, { principal: lib });
    const cReservedWork1 = await mediator.send(
      registerCopy,
      { workId: work1.id, barcode: "EX-21" },
      { principal: lib },
    );

    // Enquanto disponível, reservar falha com copy-available-use-loan
    await expect(mediator.send(placeHold, { workId: work1.id }, { principal: ana })).rejects.toMatchObject({
      code: "copy-available-use-loan",
      detail: "Há exemplares disponíveis no acervo; faça o empréstimo direto no balcão.",
    });

    // Diego e Bruno emprestam os 2 exemplares ativos (EX-20B está retired)
    const loan = await mediator.send(
      lendCopy,
      { studentRegistration: "2026-0004", barcode: "EX-20" },
      { principal: lib },
    );
    await mediator.send(lendCopy, { studentRegistration: "2026-0002", barcode: "EX-21" }, { principal: lib });

    // Total inclui retiredCopies (= 3), mas canPlaceHold usa (total - retired = 2 > 0) e available === 0
    const av = await mediator.send(availability, { workId: work1.id }, { principal: ana });
    expect(av).toEqual({
      workId: work1.id,
      totalCopies: 3,
      availableCopies: 0,
      onLoanCopies: 2,
      reservedCopies: 0,
      retiredCopies: 1,
      waitingHolds: 0,
      canPlaceHold: true,
    });

    // Ana sem matrícula ou tentando renovar empréstimo de Diego -> forbidden
    await expect(
      mediator.send(renewLoan, { loanId: loan.id, version: 1 }, { principal: studentNoReg }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      mediator.send(renewLoan, { loanId: loan.id, version: 1 }, { principal: ana }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // Diego renova o próprio empréstimo como aluno antes de existir reserva
    const diegoPrincipal = aPrincipal({ role: "student", studentRegistration: "2026-0004" });
    clock.setNow("2026-11-12T10:00:00.000Z");
    const renewed = await mediator.send(renewLoan, { loanId: loan.id, version: 1 }, { principal: diegoPrincipal });
    expect(renewed.renewalsCount).toBe(1);
    expect(renewed.version).toBe(2);
    expect(audit.events.at(-1)).toMatchObject({
      action: "loan.renewed",
      resourceType: "loan",
      resourceId: loan.id,
      changes: {
        dueDate: { before: loan.dueDate, after: renewed.dueDate },
        renewalsCount: 1,
      },
    });

    // Versão defasada ao renovar -> version-conflict
    await expect(
      mediator.send(renewLoan, { loanId: loan.id, version: 1 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "version-conflict", currentVersion: 2 });

    // Ana passa matrícula explícita própria para reservar e entra na fila; bibliotecária reserva para Bruno depois
    const holdAna = await mediator.send(
      placeHold,
      { workId: work1.id, studentRegistration: "2026-0001" },
      { principal: ana },
    );
    expect(audit.events.at(-1)).toMatchObject({
      action: "hold.placed",
      resourceType: "hold",
      resourceId: holdAna.id,
      changes: { workId: work1.id, studentRegistration: "2026-0001", status: "waiting" },
    });

    await expect(mediator.send(placeHold, { workId: work1.id }, { principal: ana })).rejects.toMatchObject({
      code: "hold-already-exists",
    });

    clock.setNow("2026-11-12T10:00:05.000Z");
    const holdBruno = await mediator.send(
      placeHold,
      { workId: work1.id, studentRegistration: "2026-0002" },
      { principal: lib },
    );
    expect(holdAna.status).toBe("waiting");
    expect(holdBruno.status).toBe("waiting");

    // Com reserva waiting, renovar bloqueia com active-hold-blocks-renewal (RN-06)
    await expect(
      mediator.send(renewLoan, { loanId: loan.id, version: 2 }, { principal: lib }),
    ).rejects.toMatchObject({
      code: "active-hold-blocks-renewal",
      detail: "Há alunos na fila de espera desta obra; devolva o exemplar sem renovar.",
    });

    // Diego devolve EX-20 -> exemplar vai para reserved (onLoan=1, reserved=1), Ana promovida para ready (+3 dias)
    clock.setNow("2026-11-15T12:00:00.000Z");
    const returned = await mediator.send(returnCopy, { barcode: "EX-20" }, { principal: lib });
    expect(returned.copy.status).toBe("reserved");
    expect(returned.assignedHold?.id).toBe(holdAna.id);
    expect(returned.assignedHold?.status).toBe("ready");
    expect(deliveredEvents).toHaveLength(1);
    expect(deliveredEvents[0]?.assignedHold?.recipientEmail).toBe("ana@alu.edu.br");
    expect(audit.events.at(-1)).toMatchObject({
      action: "copy.returned",
      changes: { copyStatus: "reserved", assignedHoldId: holdAna.id },
    });

    // Enquanto onLoan === 1 e reserved === 1 (onLoan - reserved === 0, mas + === 2!), reservar como Diego funciona!
    const holdDiego = await mediator.send(placeHold, { workId: work1.id }, { principal: diegoPrincipal });
    expect(holdDiego.status).toBe("waiting");

    // Resumo de Ana mostra reserva pronta com assignedBarcode, e resumo de Bruno mostra waiting com assignedBarcode null
    const anaHoldSum = await mediator.send(summaryHandler, { registration: "2026-0001" }, { principal: ana });
    expect(anaHoldSum.holds[0]?.assignedBarcode).toBe("EX-20");
    const brunoHoldSum = await mediator.send(summaryHandler, { registration: "2026-0002" }, { principal: bruno });
    expect(brunoHoldSum.holds[0]?.assignedBarcode).toBeNull();

    // Passam 4 dias (expirou a janela de 3 dias de Ana) -> tentativa de retirar falha com hold-expired
    clock.advanceDays(4);
    await expect(
      mediator.send(withdrawHold, { holdId: holdAna.id, version: 2 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "hold-expired" });

    // Bibliotecária dá baixa na reserva expirada de Ana -> Bruno sobe para ready e dispara 2º aviso!
    const expiredRes1 = await mediator.send(expireHold, { holdId: holdAna.id, version: 2 }, { principal: lib });
    expect(expiredRes1.expiredHold.status).toBe("expired");
    expect(expiredRes1.copy.status).toBe("reserved");
    expect(expiredRes1.promotedHold?.id).toBe(holdBruno.id);
    expect(deliveredEvents).toHaveLength(2);
    expect(deliveredEvents[1]?.assignedHold?.recipientEmail).toBe("bruno@alu.edu.br");
    expect(audit.events.at(-1)).toMatchObject({
      action: "hold.expired",
      resourceType: "hold",
      resourceId: holdAna.id,
      changes: { barcode: "EX-20", copyStatus: "reserved", promotedHoldId: holdBruno.id },
    });

    // Dentro do prazo, Bruno retira o exemplar reservado -> cria empréstimo e marca Hold fulfilled
    clock.advanceDays(1);
    const withdrawn = await mediator.send(
      withdrawHold,
      { holdId: holdBruno.id, version: 2 },
      { principal: lib },
    );
    expect(withdrawn.hold.status).toBe("fulfilled");
    expect(withdrawn.copy.status).toBe("on-loan");
    expect(withdrawn.loan.studentRegistration).toBe("2026-0002");
    expect(audit.events.at(-1)).toMatchObject({
      action: "hold.fulfilled",
      resourceType: "hold",
      resourceId: holdBruno.id,
      changes: { loanId: withdrawn.loan.id, barcode: "EX-20", studentRegistration: "2026-0002" },
    });

    // Bruno devolve EX-21 (emprestado no início) -> promove Diego (último da fila), sem mais espera depois dele
    await mediator.send(returnCopy, { barcode: cReservedWork1.barcode }, { principal: lib });
    clock.advanceDays(5);
    const expiredLast = await mediator.send(expireHold, { holdId: holdDiego.id, version: 2 }, { principal: lib });
    expect(expiredLast.expiredHold.status).toBe("expired");
    expect(expiredLast.copy.status).toBe("available");
    expect(expiredLast.promotedHold).toBeNull();
    expect(audit.events.at(-1)).toMatchObject({
      action: "hold.expired",
      changes: { copyStatus: "available", promotedHoldId: null },
    });

    // Quando Bruno devolve EX-20 agora sem fila, exemplar volta a available
    const finalReturn = await mediator.send(returnCopy, { barcode: "EX-20" }, { principal: lib });
    expect(finalReturn.copy.status).toBe("available");
    expect(finalReturn.assignedHold).toBeNull();

    // Obra 2 só com exemplar retired tem canPlaceHold === false
    const retiredOnlyCopy = await mediator.send(registerCopy, { workId: work2.id, barcode: "EX-W2" }, { principal: lib });
    await mediator.send(retireCopy, { copyId: retiredOnlyCopy.id, version: 1 }, { principal: lib });
    const w2Av = await mediator.send(availability, { workId: work2.id }, { principal: ana });
    expect(w2Av.totalCopies).toBe(1);
    expect(w2Av.retiredCopies).toBe(1);
    expect(w2Av.canPlaceHold).toBe(false);

    // Fallback de título ausente no catálogo em withdrawHold / expireHold / renewLoan / retireCopy
    const lFallback = await mediator.send(
      lendCopy,
      { studentRegistration: "2026-0001", barcode: "EX-20" },
      { principal: lib },
    );
    works.delete(work1.id);
    const renewedFallback = await mediator.send(
      renewLoan,
      { loanId: lFallback.id, version: 1 },
      { principal: lib },
    );
    expect(renewedFallback.workTitle).toBe("Obra não identificada");

    const retiredFallback = await mediator.send(
      retireCopy,
      { copyId: cReservedWork1.id, version: expiredLast.copy.version },
      { principal: lib },
    );
    expect(retiredFallback.workTitle).toBe("Obra não identificada");
  });

  test("trata remoção concorrente entre prepare e handle (TOCTOU) sem mascarar erros", async () => {
    const { deps, repo, work1 } = buildTestHarness("2026-11-10T10:00:00.000Z");
    const lib = aPrincipal({ role: "librarian" });
    const audit = new InMemoryAuditRecorder();
    let onBeforeWrite: (() => void) | undefined;

    const toctouMediator = new Mediator({
      runUnitOfWork: async (_scope, fn, opts) => {
        if (!opts?.readOnly && onBeforeWrite) {
          onBeforeWrite();
        }
        return fn({} as Kysely<unknown>);
      },
      writeAudit: audit.record,
    });

    const registerCopy = createRegisterCopyHandler(deps);
    const lendCopy = createLendCopyHandler(deps);
    const returnCopy = createReturnCopyHandler(deps);
    const retireCopy = createRetireCopyHandler(deps);
    const renewLoan = createRenewLoanHandler(deps);
    const withdrawHold = createWithdrawReservedCopyHandler(deps);
    const expireHold = createExpireHoldHandler(deps);
    const placeHold = createPlaceHoldHandler(deps);

    const copyA = await toctouMediator.send(registerCopy, { workId: work1.id, barcode: "EX-90" }, { principal: lib });

    // 1. Exemplar removido entre prepare e handle de lendCopy -> not-found
    onBeforeWrite = () => {
      repo.copies.delete(copyA.id);
    };
    await expect(
      toctouMediator.send(lendCopy, { studentRegistration: "2026-0001", barcode: "EX-90" }, { principal: lib }),
    ).rejects.toMatchObject({
      code: "not-found",
      detail: "Exemplar com código de barras 'EX-90' não encontrado.",
    });

    // Restaura exemplar para testar returnCopy, retireCopy e renewLoan TOCTOU
    onBeforeWrite = undefined;
    const copyB = await toctouMediator.send(registerCopy, { workId: work1.id, barcode: "EX-91" }, { principal: lib });
    const loanB = await toctouMediator.send(
      lendCopy,
      { studentRegistration: "2026-0001", barcode: "EX-91" },
      { principal: lib },
    );

    // Reserva na obra 1 antes da remoção concorrente
    const bruno = aPrincipal({ role: "student", studentRegistration: "2026-0002" });
    const holdB = await toctouMediator.send(placeHold, { workId: work1.id }, { principal: bruno });

    onBeforeWrite = () => {
      repo.loans.delete(loanB.id);
    };
    await expect(
      toctouMediator.send(renewLoan, { loanId: loanB.id, version: 1 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Empréstimo não encontrado." });

    // Devolve EX-91 mas empréstimo sumiu no banco -> no-active-loan
    await expect(toctouMediator.send(returnCopy, { barcode: "EX-91" }, { principal: lib })).rejects.toMatchObject({
      code: "no-active-loan",
      detail: "Não há empréstimo em aberto para o exemplar 'EX-91'.",
    });

    // Restaura loan e deleta student para cobrir internal-error de integridade em returnCopy / renewLoan
    repo.loans.set(loanB.id, loanB);
    onBeforeWrite = () => {
      repo.students.delete(loanB.studentId);
    };
    await expect(
      toctouMediator.send(renewLoan, { loanId: loanB.id, version: 1 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "internal-error", detail: "Registro vinculado ao empréstimo não encontrado." });
    await expect(toctouMediator.send(returnCopy, { barcode: "EX-91" }, { principal: lib })).rejects.toMatchObject({
      code: "internal-error",
      detail: "Aluno vinculado ao empréstimo não encontrado.",
    });

    // Reserva removida entre prepare e handle de withdrawHold / expireHold -> not-found
    onBeforeWrite = () => {
      repo.holds.delete(holdB.id);
    };
    await expect(
      toctouMediator.send(withdrawHold, { holdId: holdB.id, version: 1 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Reserva não encontrada." });
    await expect(
      toctouMediator.send(expireHold, { holdId: holdB.id, version: 1 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Reserva não encontrada." });

    // Exemplar removido entre prepare e handle de returnCopy / retireCopy -> not-found
    onBeforeWrite = () => {
      repo.copies.delete(copyB.id);
    };
    await expect(toctouMediator.send(returnCopy, { barcode: "EX-91" }, { principal: lib })).rejects.toMatchObject({
      code: "not-found",
      detail: "Exemplar com código de barras 'EX-91' não encontrado.",
    });
    await expect(
      toctouMediator.send(retireCopy, { copyId: copyB.id, version: 2 }, { principal: lib }),
    ).rejects.toMatchObject({ code: "not-found", detail: "Exemplar não encontrado." });

    expect(holdB.status).toBe("waiting");
  });
});
