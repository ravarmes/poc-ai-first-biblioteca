// Caso de uso catalog.create-work (spec 002 [1.1]-[1.4]).
import type { UseCase } from "@biblioteca/core";
import { Work, type WorkProps } from "../../domain/work.ts";
import { CATALOG_SCOPE } from "../../domain/work-repository.ts";
import { kyselyWorkRepository, type WorkRepositoryFactory } from "../../infrastructure/kysely-work-repository.ts";

export interface CreateWorkCommand {
  readonly title: string;
  readonly authors: readonly string[];
  readonly subject: string;
  readonly isbn?: string | null;
}

export function createCreateWorkHandler(
  repositoryFor: WorkRepositoryFactory = kyselyWorkRepository,
): UseCase<CreateWorkCommand, WorkProps> {
  return {
    name: "catalog.create-work",
    scope: CATALOG_SCOPE,
    allowedRoles: ["librarian"],
    handle: async ({ input, trx, emit }) => {
      const work = Work.create(input);
      const saved = await repositoryFor(trx).insert(work.props);
      emit({
        action: "work.created",
        resourceType: "work",
        resourceId: saved.id,
        changes: {
          title: saved.title.value,
          authors: saved.authors,
          subject: saved.subject,
          isbn: saved.isbn?.value ?? null,
        },
      });
      return saved;
    },
  };
}
