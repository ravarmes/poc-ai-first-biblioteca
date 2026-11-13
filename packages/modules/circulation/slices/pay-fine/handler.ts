// Caso de uso circulation.pay-fine (spec 003 História 5 [5.3], RN-03).
import type { FineDto } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import { Fine } from "../../domain/fine.ts";
import { CIRCULATION_SCOPE } from "../../domain/ports.ts";
import { type CirculationDeps, resolveClock, resolveRepoFactory, toFineDto } from "../shared.ts";

export interface PayFineCommand {
  readonly fineId: string;
  readonly version: number;
}

export function createPayFineHandler(deps: CirculationDeps): UseCase<PayFineCommand, FineDto> {
  const repositoryFor = resolveRepoFactory(deps);
  const clock = resolveClock(deps);

  return {
    name: "circulation.pay-fine",
    scope: CIRCULATION_SCOPE,
    allowedRoles: ["librarian"],
    handle: async ({ input, trx, emit }) => {
      const repo = repositoryFor(trx);
      const current = await repo.findFineById(input.fineId);
      if (!current) {
        throw new ProblemError("not-found", { detail: "Multa não encontrada." });
      }
      const paid = Fine.reconstitute(current).pay(input.version, clock.nowIso());
      const saved = await repo.updateFineWithVersion(paid.props, input.version);

      emit({
        action: "fine.paid",
        resourceType: "fine",
        resourceId: saved.id,
        changes: {
          amountCents: saved.amount.cents,
          status: { before: current.status, after: saved.status },
        },
      });

      return toFineDto(saved);
    },
  };
}
