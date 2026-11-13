// Caso de uso circulation.withdraw-reserved-copy (spec 003 História 3 [3.3], RN-01, RN-02, RN-03, RN-07).
// O empréstimo da reserva também nasce pela raiz: `student.borrow` no Student inteiro, gravado com a versão lida.
import type { WithdrawHoldResultDto } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import { Copy } from "../../domain/copy.ts";
import { Hold } from "../../domain/hold.ts";
import { CIRCULATION_SCOPE } from "../../domain/ports.ts";
import { type CirculationDeps, resolveClock, resolveRepoFactory, toCopyDto, toHoldDto, toLoanDto } from "../shared.ts";

export interface WithdrawReservedCopyCommand {
  readonly holdId: string;
  readonly version: number;
}

export interface PreparedWithdrawHold {
  readonly loanDate: string;
  readonly dueDate: string;
  readonly workTitle: string;
}

export function createWithdrawReservedCopyHandler(
  deps: CirculationDeps,
): UseCase<WithdrawReservedCopyCommand, WithdrawHoldResultDto, PreparedWithdrawHold> {
  const repositoryFor = resolveRepoFactory(deps);
  const clock = resolveClock(deps);

  return {
    name: "circulation.withdraw-reserved-copy",
    scope: CIRCULATION_SCOPE,
    allowedRoles: ["librarian"],
    prepare: async ({ input, read }) => {
      const calendar = await deps.calendar.getCalendar();
      const loanDate = clock.todayYmd();
      const dueDate = calendar.computeDueDate(loanDate);
      const hold = await read(CIRCULATION_SCOPE, (trx) => repositoryFor(trx).findHoldById(input.holdId));
      if (!hold) {
        throw new ProblemError("not-found", { detail: "Reserva não encontrada." });
      }
      const work = await deps.catalog.getWork(hold.workId);
      return {
        loanDate,
        dueDate,
        workTitle: work?.title ?? "Obra não identificada",
      };
    },
    handle: async ({ input, trx, emit, prepared }) => {
      const repo = repositoryFor(trx);
      const nowIso = clock.nowIso();

      const holdProps = await repo.findHoldById(input.holdId);
      if (!holdProps) {
        throw new ProblemError("not-found", { detail: "Reserva não encontrada." });
      }

      const fulfilledHold = Hold.reconstitute(holdProps).fulfill(input.version, nowIso);
      if (!holdProps.assignedCopyId) {
        throw new ProblemError("invalid-copy-state", { detail: "A reserva não possui exemplar atribuído." });
      }

      const [student, copyProps] = await Promise.all([
        repo.loadStudent(holdProps.studentId),
        repo.findCopyById(holdProps.assignedCopyId),
      ]);

      if (!student || !copyProps) {
        throw new ProblemError("internal-error", { detail: "Aluno ou exemplar da reserva não encontrado." });
      }
      const studentProps = student.props;

      const borrowed = student.borrow(
        { copyId: copyProps.id, workId: copyProps.workId, loanDate: prepared.loanDate, dueDate: prepared.dueDate },
        nowIso,
      );

      const nextCopy = Copy.reconstitute(copyProps).withdrawFromReservation(nowIso);
      const savedHold = await repo.updateHoldWithVersion(fulfilledHold.props, input.version);
      const savedCopy = await repo.updateCopyWithVersion(nextCopy.props, copyProps.version);
      await repo.saveStudent(borrowed.student, studentProps.version);
      const savedLoan = borrowed.loan.props;

      emit({
        action: "hold.fulfilled",
        resourceType: "hold",
        resourceId: savedHold.id,
        changes: {
          loanId: savedLoan.id,
          barcode: savedCopy.barcode,
          studentRegistration: studentProps.registration,
          dueDate: savedLoan.dueDate,
        },
      });

      return {
        hold: toHoldDto(savedHold, {
          workTitle: prepared.workTitle,
          studentRegistration: studentProps.registration,
          assignedBarcode: savedCopy.barcode,
        }),
        loan: toLoanDto(savedLoan, {
          barcode: savedCopy.barcode,
          workTitle: prepared.workTitle,
          studentRegistration: studentProps.registration,
        }),
        copy: toCopyDto(savedCopy, prepared.workTitle),
      };
    },
  };
}
