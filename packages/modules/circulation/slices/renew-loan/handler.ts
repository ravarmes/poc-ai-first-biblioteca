// Caso de uso circulation.renew-loan (spec 003 História 4 [4.1]-[4.4], RN-03, RN-06).
import type { LoanDto } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import { Loan } from "../../domain/loan.ts";
import { CIRCULATION_SCOPE } from "../../domain/ports.ts";
import { type CirculationDeps, resolveClock, resolveRepoFactory, toLoanDto } from "../shared.ts";

export interface RenewLoanCommand {
  readonly loanId: string;
  readonly version: number;
}

export interface PreparedRenewLoan {
  readonly newDueDate: string;
  readonly workTitle: string;
}

export function createRenewLoanHandler(
  deps: CirculationDeps,
): UseCase<RenewLoanCommand, LoanDto, PreparedRenewLoan> {
  const repositoryFor = resolveRepoFactory(deps);
  const clock = resolveClock(deps);

  return {
    name: "circulation.renew-loan",
    scope: CIRCULATION_SCOPE,
    allowedRoles: ["librarian", "student"],
    authorize: async (input, principal, read) => {
      if (principal.role === "librarian") return true;
      if (!principal.studentRegistration) return false;
      return read(CIRCULATION_SCOPE, async (trx) => {
        const repo = repositoryFor(trx);
        const loan = await repo.findLoanById(input.loanId);
        if (!loan) return true; // deixa `prepare` responder 404 em vez de mascarar com 403
        const owner = await repo.findStudentById(loan.studentId);
        return owner?.registration === principal.studentRegistration;
      });
    },
    prepare: async ({ input, read }) => {
      const calendar = await deps.calendar.getCalendar();
      const newDueDate = calendar.computeDueDate(clock.todayYmd());
      const loan = await read(CIRCULATION_SCOPE, (trx) => repositoryFor(trx).findLoanById(input.loanId));
      if (!loan) {
        throw new ProblemError("not-found", { detail: "Empréstimo não encontrado." });
      }
      const work = await deps.catalog.getWork(loan.workId);
      return {
        newDueDate,
        workTitle: work?.title ?? "Obra não identificada",
      };
    },
    handle: async ({ input, trx, emit, prepared }) => {
      const repo = repositoryFor(trx);
      const loanProps = await repo.findLoanById(input.loanId);
      if (!loanProps) {
        throw new ProblemError("not-found", { detail: "Empréstimo não encontrado." });
      }

      const [student, copyProps, hasWaitingHold] = await Promise.all([
        repo.loadStudent(loanProps.studentId),
        repo.findCopyById(loanProps.copyId),
        repo.hasWaitingHoldForWork(loanProps.workId),
      ]);

      if (!student || !copyProps) {
        throw new ProblemError("internal-error", { detail: "Registro vinculado ao empréstimo não encontrado." });
      }
      const studentProps = student.props;

      // Multa pendente recusa a renovação (RN-01): a raiz confere pelas multas que guarda.
      student.ensureCanRenew();

      if (hasWaitingHold) {
        throw new ProblemError("active-hold-blocks-renewal", {
          detail: "Há alunos na fila de espera desta obra; devolva o exemplar sem renovar.",
        });
      }

      const renewed = Loan.reconstitute(loanProps).renew(prepared.newDueDate, input.version);
      const saved = await repo.updateLoanWithVersion(renewed.props, input.version);

      emit({
        action: "loan.renewed",
        resourceType: "loan",
        resourceId: saved.id,
        changes: {
          dueDate: { before: loanProps.dueDate, after: saved.dueDate },
          renewalsCount: saved.renewalsCount,
        },
      });

      return toLoanDto(saved, {
        barcode: copyProps.barcode,
        workTitle: prepared.workTitle,
        studentRegistration: studentProps.registration,
      });
    },
  };
}
