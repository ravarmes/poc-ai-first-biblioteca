// Caso de uso catalog.get-work (spec 002 [2.4]).
import { ProblemError, type UseCase } from "@biblioteca/core";
import type { WorkProps } from "../../domain/work.ts";
import { CATALOG_SCOPE } from "../../domain/work-repository.ts";
import { kyselyWorkRepository, type WorkRepositoryFactory } from "../../infrastructure/kysely-work-repository.ts";

export interface GetWorkQuery {
  readonly workId: string;
}

export function createGetWorkHandler(
  repositoryFor: WorkRepositoryFactory = kyselyWorkRepository,
): UseCase<GetWorkQuery, WorkProps> {
  return {
    name: "catalog.get-work",
    scope: CATALOG_SCOPE,
    readOnly: true,
    allowedRoles: ["librarian", "student"],
    handle: async ({ input, trx }) => {
      const found = await repositoryFor(trx).findById(input.workId);
      if (!found) {
        throw new ProblemError("not-found", { detail: "Obra não encontrada no catálogo." });
      }
      return found;
    },
  };
}
