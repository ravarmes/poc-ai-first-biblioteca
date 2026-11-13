// Caso de uso circulation.return-copy (spec 003 História 2 [2.1]-[2.4], RN-04..RN-08, Encontro 3 slides 32-33).
import type { FineDto, HoldDto, ReturnCopyRequest, ReturnCopyResultDto } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import { Copy } from "../../domain/copy.ts";
import { Fine } from "../../domain/fine.ts";
import { Hold } from "../../domain/hold.ts";
import { Loan } from "../../domain/loan.ts";
import { CIRCULATION_SCOPE } from "../../domain/ports.ts";
import { normalizeBarcode } from "../../domain/value-objects.ts";
import {
  buildCopyReturnedEventV1,
  type CirculationDeps,
  resolveClock,
  resolveRepoFactory,
  toCopyDto,
  toFineDto,
  toHoldDto,
  toLoanDto,
} from "../shared.ts";

export interface PreparedReturnCopy {
  readonly dailyRateCents: number;
  readonly workTitle: string;
}

export function createReturnCopyHandler(
  deps: CirculationDeps,
): UseCase<ReturnCopyRequest, ReturnCopyResultDto, PreparedReturnCopy> {
  const repositoryFor = resolveRepoFactory(deps);
  const clock = resolveClock(deps);

  return {
    name: "circulation.return-copy",
    scope: CIRCULATION_SCOPE,
    allowedRoles: ["librarian"],
    prepare: async ({ input, read }) => {
      const barcode = normalizeBarcode(input.barcode);
      const dailyRateCents = await deps.config.currentDailyRateCents();
      const copy = await read(CIRCULATION_SCOPE, (trx) => repositoryFor(trx).findCopyByBarcode(barcode));
      if (!copy) {
        throw new ProblemError("not-found", {
          detail: `Exemplar com código de barras '${barcode}' não encontrado.`,
        });
      }
      const work = await deps.catalog.getWork(copy.workId);
      return {
        dailyRateCents,
        workTitle: work?.title ?? "Obra não identificada",
      };
    },
    handle: async ({ input, trx, emit, afterCommit, prepared }) => {
      const repo = repositoryFor(trx);
      const barcode = normalizeBarcode(input.barcode);
      const nowIso = clock.nowIso();
      const todayYmd = clock.todayYmd();

      const copyProps = await repo.findCopyByBarcode(barcode);
      if (!copyProps) {
        throw new ProblemError("not-found", {
          detail: `Exemplar com código de barras '${barcode}' não encontrado.`,
        });
      }

      if (copyProps.status !== "on-loan") {
        // Dispara erro padronizado no-active-loan pelo domínio de Copy
        Copy.reconstitute(copyProps).returnToPool(false, nowIso);
      }

      const openLoan = await repo.findOpenLoanByCopyId(copyProps.id);
      if (!openLoan) {
        throw new ProblemError("no-active-loan", {
          detail: `Não há empréstimo em aberto para o exemplar '${barcode}'.`,
        });
      }

      const student = await repo.findStudentById(openLoan.studentId);
      if (!student) {
        throw new ProblemError("internal-error", { detail: "Aluno vinculado ao empréstimo não encontrado." });
      }

      const closedLoan = Loan.reconstitute(openLoan).close(todayYmd);
      const savedLoan = await repo.updateLoanWithVersion(closedLoan.props, openLoan.version);

      let savedFineDto: FineDto | null = null;
      const maybeFine = Fine.createIfOverdue({
        studentId: openLoan.studentId,
        loanId: savedLoan.id,
        dueDateYmd: savedLoan.dueDate,
        returnedDateYmd: todayYmd,
        dailyRateCents: prepared.dailyRateCents,
        nowIso,
      });
      if (maybeFine) {
        const persistedFine = await repo.insertFine(maybeFine.props);
        savedFineDto = toFineDto(persistedFine);
      }

      const waitingHold = await repo.findNextWaitingHoldFifo(copyProps.workId);
      let savedHoldDto: HoldDto | null = null;

      const updatedCopy = Copy.reconstitute(copyProps).returnToPool(Boolean(waitingHold), nowIso);
      const savedCopy = await repo.updateCopyWithVersion(updatedCopy.props, copyProps.version);

      if (waitingHold) {
        const promotedHold = Hold.reconstitute(waitingHold).assignCopy(savedCopy.id, nowIso);
        const savedHold = await repo.updateHoldWithVersion(promotedHold.props, waitingHold.version);
        const holdStudent = await repo.findStudentById(savedHold.studentId);
        if (!holdStudent) {
          throw new ProblemError("internal-error", { detail: "Aluno da reserva promovida não encontrado." });
        }

        savedHoldDto = toHoldDto(savedHold, {
          workTitle: prepared.workTitle,
          studentRegistration: holdStudent.registration,
          assignedBarcode: savedCopy.barcode,
        });

        const event = buildCopyReturnedEventV1({
          occurredAt: nowIso,
          copy: savedCopy,
          workTitle: prepared.workTitle,
          promotedHold: savedHold,
          recipientStudent: holdStudent,
        });
        afterCommit(() => deps.notices.handleCopyReturned(event));
      }

      emit({
        action: "copy.returned",
        resourceType: "copy",
        resourceId: savedCopy.id,
        changes: {
          barcode: savedCopy.barcode,
          loanId: savedLoan.id,
          copyStatus: savedCopy.status,
          fineAmountCents: savedFineDto?.amountCents ?? null,
          assignedHoldId: savedHoldDto?.id ?? null,
        },
      });

      return {
        loan: toLoanDto(savedLoan, {
          barcode: savedCopy.barcode,
          workTitle: prepared.workTitle,
          studentRegistration: student.registration,
        }),
        copy: toCopyDto(savedCopy, prepared.workTitle),
        fine: savedFineDto,
        assignedHold: savedHoldDto,
      };
    },
  };
}
