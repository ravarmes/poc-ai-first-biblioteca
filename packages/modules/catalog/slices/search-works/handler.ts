// Caso de uso catalog.search-works (spec 002 [2.1]-[2.3], [2.5], ADR-0005).
import type { PageResult, UseCase } from "@biblioteca/core";
import type { WorkProps } from "../../domain/work.ts";
import { CATALOG_SCOPE, type SearchWorksFilter } from "../../domain/work-repository.ts";
import { kyselyWorkRepository, type WorkRepositoryFactory } from "../../infrastructure/kysely-work-repository.ts";

export function createSearchWorksHandler(
  repositoryFor: WorkRepositoryFactory = kyselyWorkRepository,
): UseCase<SearchWorksFilter, PageResult<WorkProps>> {
  return {
    name: "catalog.search-works",
    scope: CATALOG_SCOPE,
    readOnly: true,
    allowedRoles: ["librarian", "student"],
    handle: async ({ input, trx }) => repositoryFor(trx).search(input),
  };
}
