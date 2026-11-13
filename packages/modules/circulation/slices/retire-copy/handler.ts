// Caso de uso circulation.retire-copy (spec 003 [5.2]).
import type { CopyDto } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import { Copy } from "../../domain/copy.ts";
import { CIRCULATION_SCOPE } from "../../domain/ports.ts";
import { type CirculationDeps, resolveClock, resolveRepoFactory, toCopyDto } from "../shared.ts";

export interface RetireCopyCommand {
  readonly copyId: string;
  readonly version: number;
}

export interface PreparedRetireCopy {
  readonly workTitle: string;
}

export function createRetireCopyHandler(
  deps: CirculationDeps,
): UseCase<RetireCopyCommand, CopyDto, PreparedRetireCopy> {
  const repositoryFor = resolveRepoFactory(deps);
  const clock = resolveClock(deps);

  return {
    name: "circulation.retire-copy",
    scope: CIRCULATION_SCOPE,
    allowedRoles: ["librarian"],
    prepare: async ({ input, read }) => {
      const existing = await read(CIRCULATION_SCOPE, (trx) => repositoryFor(trx).findCopyById(input.copyId));
      if (!existing) {
        throw new ProblemError("not-found", { detail: "Exemplar não encontrado." });
      }
      const work = await deps.catalog.getWork(existing.workId);
      return { workTitle: work?.title ?? "Obra não identificada" };
    },
    handle: async ({ input, trx, emit, prepared }) => {
      const repo = repositoryFor(trx);
      const current = await repo.findCopyById(input.copyId);
      if (!current) {
        throw new ProblemError("not-found", { detail: "Exemplar não encontrado." });
      }
      const retired = Copy.reconstitute(current).retire(input.version, clock.nowIso());
      const saved = await repo.updateCopyWithVersion(retired.props, input.version);
      emit({
        action: "copy.retired",
        resourceType: "copy",
        resourceId: saved.id,
        changes: {
          barcode: saved.barcode.value,
          status: { before: current.status, after: saved.status },
        },
      });
      return toCopyDto(saved, prepared.workTitle);
    },
  };
}
