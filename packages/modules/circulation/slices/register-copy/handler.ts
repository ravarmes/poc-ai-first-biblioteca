// Caso de uso circulation.register-copy (spec 003 [5.1], ADR-0006).
import type { CopyDto, RegisterCopyRequest } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import { Copy } from "../../domain/copy.ts";
import { CIRCULATION_SCOPE } from "../../domain/ports.ts";
import { type CirculationDeps, resolveClock, resolveRepoFactory, toCopyDto } from "../shared.ts";

export interface PreparedRegisterCopy {
  readonly workTitle: string;
}

export function createRegisterCopyHandler(
  deps: CirculationDeps,
): UseCase<RegisterCopyRequest, CopyDto, PreparedRegisterCopy> {
  const repositoryFor = resolveRepoFactory(deps);
  const clock = resolveClock(deps);

  return {
    name: "circulation.register-copy",
    scope: CIRCULATION_SCOPE,
    allowedRoles: ["librarian"],
    prepare: async ({ input }) => {
      const work = await deps.catalog.getWork(input.workId);
      if (!work) {
        throw new ProblemError("not-found", {
          detail: "Obra não encontrada no catálogo para vincular exemplar.",
        });
      }
      return { workTitle: work.title };
    },
    handle: async ({ input, trx, emit, prepared }) => {
      const copy = Copy.register({ workId: input.workId, barcode: input.barcode }, clock.nowIso());
      const saved = await repositoryFor(trx).insertCopy(copy.props);
      emit({
        action: "copy.registered",
        resourceType: "copy",
        resourceId: saved.id,
        changes: {
          workId: saved.workId,
          barcode: saved.barcode.value,
          status: saved.status,
        },
      });
      return toCopyDto(saved, prepared.workTitle);
    },
  };
}
