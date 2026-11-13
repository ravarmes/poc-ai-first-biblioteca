// Caso de uso circulation.place-hold (spec 003 História 3 [3.1]-[3.2], RF-03, RN-07).
import type { HoldDto, PlaceHoldRequest } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import { Hold } from "../../domain/hold.ts";
import { type AcademicStudent, CIRCULATION_SCOPE } from "../../domain/ports.ts";
import { StudentRegistration } from "../../domain/value-objects.ts";
import { requireActiveAcademicStudent } from "../../infrastructure/academic-translator.ts";
import { type CirculationDeps, resolveClock, resolveRepoFactory, toHoldDto } from "../shared.ts";

export interface PreparedPlaceHold {
  readonly academic: AcademicStudent;
  readonly workTitle: string;
}

export function createPlaceHoldHandler(
  deps: CirculationDeps,
): UseCase<PlaceHoldRequest, HoldDto, PreparedPlaceHold> {
  const repositoryFor = resolveRepoFactory(deps);
  const clock = resolveClock(deps);

  return {
    name: "circulation.place-hold",
    scope: CIRCULATION_SCOPE,
    allowedRoles: ["librarian", "student"],
    authorize: (input, principal) => {
      if (principal.role === "librarian") return true;
      if (!principal.studentRegistration) return false;
      return !input.studentRegistration || StudentRegistration.of(input.studentRegistration).value === principal.studentRegistration;
    },
    prepare: async ({ input, principal }) => {
      const targetRegistration =
        principal?.role === "student" ? principal.studentRegistration : input.studentRegistration;

      if (!targetRegistration) {
        throw new ProblemError("validation-error", {
          detail: "Informe a matrícula do aluno para registrar a reserva.",
          errors: [{ field: "studentRegistration", message: "matrícula obrigatória" }],
        });
      }

      const work = await deps.catalog.getWork(input.workId);
      if (!work) {
        throw new ProblemError("not-found", { detail: "Obra não encontrada no catálogo." });
      }

      const academic = await requireActiveAcademicStudent(
        deps.academicRegistry,
        StudentRegistration.of(targetRegistration),
      );
      return { academic, workTitle: work.title };
    },
    handle: async ({ input, trx, emit, prepared }) => {
      const repo = repositoryFor(trx);
      const nowIso = clock.nowIso();

      const counts = await repo.countByWork(input.workId);
      if (counts.availableCopies > 0) {
        throw new ProblemError("copy-available-use-loan", {
          detail: "Há exemplares disponíveis no acervo; faça o empréstimo direto no balcão.",
        });
      }
      if (counts.onLoanCopies + counts.reservedCopies === 0) {
        throw new ProblemError("invalid-copy-state", {
          detail: "Esta obra não possui exemplares circulantes ativos para reserva.",
        });
      }

      const studentProps = await repo.upsertStudentFromAcademic(prepared.academic, nowIso);
      const [student, alreadyHasHold] = await Promise.all([
        repo.loadStudent(studentProps.id),
        repo.hasActiveHold(studentProps.id, input.workId),
      ]);
      if (!student) {
        throw new ProblemError("internal-error", { detail: "Aluno não encontrado depois da sincronização." });
      }
      student.ensureCanPlaceHold(alreadyHasHold);

      const hold = Hold.place({
        workId: input.workId,
        studentId: studentProps.id,
        nowIso,
      });
      const savedHold = await repo.insertHold(hold.props);

      emit({
        action: "hold.placed",
        resourceType: "hold",
        resourceId: savedHold.id,
        changes: {
          workId: savedHold.workId,
          studentRegistration: studentProps.registration.value,
          status: savedHold.status,
        },
      });

      return toHoldDto(savedHold, {
        workTitle: prepared.workTitle,
        studentRegistration: studentProps.registration,
        assignedBarcode: null,
      });
    },
  };
}
