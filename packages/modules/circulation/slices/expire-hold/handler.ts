// Caso de uso circulation.expire-hold (spec 003 História 3 [3.4], RN-07, RN-08).
import type { ExpireHoldResultDto, HoldDto } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import { Copy } from "../../domain/copy.ts";
import { Hold } from "../../domain/hold.ts";
import { CIRCULATION_SCOPE } from "../../domain/ports.ts";
import {
  buildCopyReturnedEventV1,
  type CirculationDeps,
  resolveClock,
  resolveRepoFactory,
  toCopyDto,
  toHoldDto,
} from "../shared.ts";

export interface ExpireHoldCommand {
  readonly holdId: string;
  readonly version: number;
}

export interface PreparedExpireHold {
  readonly workTitle: string;
}

export function createExpireHoldHandler(
  deps: CirculationDeps,
): UseCase<ExpireHoldCommand, ExpireHoldResultDto, PreparedExpireHold> {
  const repositoryFor = resolveRepoFactory(deps);
  const clock = resolveClock(deps);

  return {
    name: "circulation.expire-hold",
    scope: CIRCULATION_SCOPE,
    allowedRoles: ["librarian"],
    prepare: async ({ input, read }) => {
      const hold = await read(CIRCULATION_SCOPE, (trx) => repositoryFor(trx).findHoldById(input.holdId));
      if (!hold) {
        throw new ProblemError("not-found", { detail: "Reserva não encontrada." });
      }
      const work = await deps.catalog.getWork(hold.workId);
      return { workTitle: work?.title ?? "Obra não identificada" };
    },
    handle: async ({ input, trx, emit, afterCommit, prepared }) => {
      const repo = repositoryFor(trx);
      const nowIso = clock.nowIso();

      const holdProps = await repo.findHoldById(input.holdId);
      if (!holdProps) {
        throw new ProblemError("not-found", { detail: "Reserva não encontrada." });
      }

      const expiredHold = Hold.reconstitute(holdProps).expire(input.version, nowIso);
      if (!holdProps.assignedCopyId) {
        throw new ProblemError("invalid-copy-state", { detail: "Reserva expirada não possui exemplar vinculado." });
      }

      const [expiredOwner, copyProps] = await Promise.all([
        repo.findStudentById(holdProps.studentId),
        repo.findCopyById(holdProps.assignedCopyId),
      ]);
      if (!expiredOwner || !copyProps) {
        throw new ProblemError("internal-error", { detail: "Dados vinculados à reserva não encontrados." });
      }

      const savedExpired = await repo.updateHoldWithVersion(expiredHold.props, input.version);
      const nextWaiting = await repo.findNextWaitingHoldFifo(holdProps.workId);

      const nextCopy = Copy.reconstitute(copyProps).releaseReservation(Boolean(nextWaiting), nowIso);
      const savedCopy = await repo.updateCopyWithVersion(nextCopy.props, copyProps.version);

      let promotedDto: HoldDto | null = null;
      if (nextWaiting) {
        const promotedHold = Hold.reconstitute(nextWaiting).assignCopy(savedCopy.id, nowIso);
        const savedPromoted = await repo.updateHoldWithVersion(promotedHold.props, nextWaiting.version);
        const nextStudent = await repo.findStudentById(savedPromoted.studentId);
        if (!nextStudent) {
          throw new ProblemError("internal-error", { detail: "Aluno promovido da fila não encontrado." });
        }

        promotedDto = toHoldDto(savedPromoted, {
          workTitle: prepared.workTitle,
          studentRegistration: nextStudent.registration,
          assignedBarcode: savedCopy.barcode,
        });

        const event = buildCopyReturnedEventV1({
          occurredAt: nowIso,
          copy: savedCopy,
          workTitle: prepared.workTitle,
          promotedHold: savedPromoted,
          recipientStudent: nextStudent,
        });
        afterCommit(() => deps.notices.handleCopyReturned(event));
      }

      emit({
        action: "hold.expired",
        resourceType: "hold",
        resourceId: savedExpired.id,
        changes: {
          barcode: savedCopy.barcode.value,
          copyStatus: savedCopy.status,
          promotedHoldId: promotedDto?.id ?? null,
        },
      });

      return {
        expiredHold: toHoldDto(savedExpired, {
          workTitle: prepared.workTitle,
          studentRegistration: expiredOwner.registration,
          assignedBarcode: savedCopy.barcode,
        }),
        copy: toCopyDto(savedCopy, prepared.workTitle),
        promotedHold: promotedDto,
      };
    },
  };
}
