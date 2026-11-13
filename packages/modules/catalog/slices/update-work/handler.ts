// Caso de uso catalog.update-work (spec 002 [1.5]).
import { ProblemError, type UseCase } from "@biblioteca/core";
import { Work, type WorkProps } from "../../domain/work.ts";
import { CATALOG_SCOPE } from "../../domain/work-repository.ts";
import { kyselyWorkRepository, type WorkRepositoryFactory } from "../../infrastructure/kysely-work-repository.ts";

export interface UpdateWorkCommand {
  readonly workId: string;
  readonly version: number;
  readonly title?: string;
  readonly authors?: readonly string[];
  readonly subject?: string;
  readonly isbn?: string | null;
}

export function createUpdateWorkHandler(
  repositoryFor: WorkRepositoryFactory = kyselyWorkRepository,
): UseCase<UpdateWorkCommand, WorkProps> {
  return {
    name: "catalog.update-work",
    scope: CATALOG_SCOPE,
    allowedRoles: ["librarian"],
    handle: async ({ input, trx, emit }) => {
      const repo = repositoryFor(trx);
      const current = await repo.findById(input.workId);
      if (!current) {
        throw new ProblemError("not-found", { detail: "Obra não encontrada." });
      }
      const { work, changed, changes } = Work.reconstitute(current).edit(
        {
          title: input.title,
          authors: input.authors,
          subject: input.subject,
          isbn: input.isbn,
        },
        input.version,
      );
      if (!changed) {
        return current;
      }
      const saved = await repo.updateWithVersion(work.props, input.version);
      emit({
        action: "work.updated",
        resourceType: "work",
        resourceId: saved.id,
        changes,
      });
      return saved;
    },
  };
}
