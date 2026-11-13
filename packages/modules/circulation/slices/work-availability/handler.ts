// Caso de uso circulation.work-availability (consulta disponibilidade de exemplares e fila).
import type { WorkAvailabilityDto } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import { CIRCULATION_SCOPE } from "../../domain/ports.ts";
import { type CirculationDeps, resolveRepoFactory } from "../shared.ts";

export interface WorkAvailabilityQuery {
  readonly workId: string;
}

export function createWorkAvailabilityHandler(
  deps: CirculationDeps,
): UseCase<WorkAvailabilityQuery, WorkAvailabilityDto> {
  const repositoryFor = resolveRepoFactory(deps);

  return {
    name: "circulation.work-availability",
    scope: CIRCULATION_SCOPE,
    readOnly: true,
    allowedRoles: ["librarian", "student"],
    prepare: async ({ input }) => {
      const work = await deps.catalog.getWork(input.workId);
      if (!work) {
        throw new ProblemError("not-found", { detail: "Obra não encontrada no catálogo." });
      }
      return undefined;
    },
    handle: async ({ input, trx }) => {
      const counts = await repositoryFor(trx).countByWork(input.workId);
      const totalCopies = counts.availableCopies + counts.onLoanCopies + counts.reservedCopies + counts.retiredCopies;
      const canPlaceHold = counts.availableCopies === 0 && totalCopies - counts.retiredCopies > 0;
      return {
        workId: input.workId,
        totalCopies,
        availableCopies: counts.availableCopies,
        onLoanCopies: counts.onLoanCopies,
        reservedCopies: counts.reservedCopies,
        retiredCopies: counts.retiredCopies,
        waitingHolds: counts.waitingHolds,
        canPlaceHold,
      };
    },
  };
}
