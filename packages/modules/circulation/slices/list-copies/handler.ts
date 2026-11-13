// Caso de uso circulation.list-copies.
import type { CopyDto } from "@biblioteca/contract";
import type { PageResult, UseCase } from "@biblioteca/core";
import type { CopyProps } from "../../domain/copy.ts";
import { CIRCULATION_SCOPE, type ListCopiesFilter } from "../../domain/ports.ts";
import { type CirculationDeps, resolveRepoFactory, toCopyDto } from "../shared.ts";

export interface PreparedListCopies {
  readonly page: PageResult<CopyProps>;
  readonly titles: ReadonlyMap<string, string>;
}

export function createListCopiesHandler(
  deps: CirculationDeps,
): UseCase<ListCopiesFilter, PageResult<CopyDto>, PreparedListCopies> {
  const repositoryFor = resolveRepoFactory(deps);

  return {
    name: "circulation.list-copies",
    scope: CIRCULATION_SCOPE,
    readOnly: true,
    allowedRoles: ["librarian", "student"],
    prepare: async ({ input, read }) => {
      const page = await read(CIRCULATION_SCOPE, (trx) => repositoryFor(trx).listCopies(input));
      const works = await deps.catalog.getWorksByIds(page.items.map((c) => c.workId));
      const titles = new Map<string, string>();
      for (const [id, summary] of works) {
        titles.set(id, summary.title);
      }
      return { page, titles };
    },
    handle: async ({ prepared }) => ({
      items: prepared.page.items.map((copy) => toCopyDto(copy, prepared.titles.get(copy.workId) ?? "Obra não identificada")),
      nextCursor: prepared.page.nextCursor,
    }),
  };
}
