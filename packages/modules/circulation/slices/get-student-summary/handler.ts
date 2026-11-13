// Caso de uso circulation.get-student-summary (spec 003 História 5 [5.4], RF-05).
import type { FineDto, HoldDto, LoanDto, StudentSummaryDto } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import type { FineProps } from "../../domain/fine.ts";
import type { HoldProps } from "../../domain/hold.ts";
import type { LoanProps } from "../../domain/loan.ts";
import { type AcademicStudent, CIRCULATION_SCOPE } from "../../domain/ports.ts";
import { STUDENT_LOAN_LIMIT, type StudentProps } from "../../domain/student.ts";
import { type Barcode, StudentRegistration } from "../../domain/value-objects.ts";
import {
  type CirculationDeps,
  resolveClock,
  resolveRepoFactory,
  toFineDto,
  toHoldDto,
  toLoanDto,
} from "../shared.ts";

export interface GetStudentSummaryQuery {
  readonly registration: string;
}

export type PreparedStudentSummary =
  | {
      readonly existsLocally: true;
      readonly student: StudentProps;
      readonly openLoans: readonly LoanProps[];
      readonly holds: readonly HoldProps[];
      readonly fines: readonly FineProps[];
      readonly barcodesByCopyId: ReadonlyMap<string, Barcode>;
      readonly titlesByWorkId: ReadonlyMap<string, string>;
    }
  | {
      readonly existsLocally: false;
      readonly academic: AcademicStudent;
    };

export function createGetStudentSummaryHandler(
  deps: CirculationDeps,
): UseCase<GetStudentSummaryQuery, StudentSummaryDto, PreparedStudentSummary> {
  const repositoryFor = resolveRepoFactory(deps);
  const clock = resolveClock(deps);

  return {
    name: "circulation.get-student-summary",
    scope: CIRCULATION_SCOPE,
    allowedRoles: ["librarian", "student"],
    authorize: (input, principal) => {
      if (principal.role === "librarian") return true;
      if (!principal.studentRegistration) return false;
      return StudentRegistration.of(input.registration).value === principal.studentRegistration;
    },
    prepare: async ({ input, read }) => {
      const registration = StudentRegistration.of(input.registration);
      const localData = await read(CIRCULATION_SCOPE, async (trx) => {
        const repo = repositoryFor(trx);
        const student = await repo.findStudentByRegistration(registration);
        if (!student) return null;

        const [openLoans, holds, fines] = await Promise.all([
          repo.listOpenLoansByStudent(student.id),
          repo.listHoldsByStudent(student.id),
          repo.listFinesByStudent(student.id),
        ]);

        const copyIds = new Set<string>();
        for (const loan of openLoans) copyIds.add(loan.copyId);
        for (const hold of holds) {
          if (hold.assignedCopyId) copyIds.add(hold.assignedCopyId);
        }
        const copies = await repo.findCopiesByIds([...copyIds]);
        const barcodesByCopyId = new Map(copies.map((c) => [c.id, c.barcode]));

        return { student, openLoans, holds, fines, barcodesByCopyId };
      });

      if (!localData) {
        const academic = await deps.academicRegistry.findByRegistration(registration);
        if (!academic) {
          throw new ProblemError("not-found", {
            detail: `Aluno com matrícula '${registration.value}' não encontrado.`,
          });
        }
        return { existsLocally: false, academic };
      }

      const workIds = new Set<string>();
      for (const loan of localData.openLoans) workIds.add(loan.workId);
      for (const hold of localData.holds) workIds.add(hold.workId);
      const works = await deps.catalog.getWorksByIds([...workIds]);
      const titlesByWorkId = new Map<string, string>();
      for (const [id, summary] of works) {
        titlesByWorkId.set(id, summary.title);
      }

      return {
        existsLocally: true,
        ...localData,
        titlesByWorkId,
      };
    },
    handle: async ({ trx, prepared }) => {
      if (!prepared.existsLocally) {
        const student = await repositoryFor(trx).upsertStudentFromAcademic(prepared.academic, clock.nowIso());
        return {
          id: student.id,
          registration: student.registration.value,
          name: student.name,
          email: student.email.value,
          activeLoansCount: 0,
          loanLimit: STUDENT_LOAN_LIMIT,
          openLoans: [],
          holds: [],
          fines: [],
        };
      }

      const openLoans: LoanDto[] = prepared.openLoans.map((loan) =>
        toLoanDto(loan, {
          barcode: prepared.barcodesByCopyId.get(loan.copyId) ?? null,
          workTitle: prepared.titlesByWorkId.get(loan.workId) ?? "Obra não identificada",
          studentRegistration: prepared.student.registration,
        }),
      );

      const holds: HoldDto[] = prepared.holds.map((hold) =>
        toHoldDto(hold, {
          workTitle: prepared.titlesByWorkId.get(hold.workId) ?? "Obra não identificada",
          studentRegistration: prepared.student.registration,
          assignedBarcode: hold.assignedCopyId ? (prepared.barcodesByCopyId.get(hold.assignedCopyId) ?? null) : null,
        }),
      );

      const fines: FineDto[] = prepared.fines.map(toFineDto);

      return {
        id: prepared.student.id,
        registration: prepared.student.registration.value,
        name: prepared.student.name,
        email: prepared.student.email.value,
        activeLoansCount: openLoans.length,
        loanLimit: STUDENT_LOAN_LIMIT,
        openLoans,
        holds,
        fines,
      };
    },
  };
}
