import type { UseCase } from "@biblioteca/core";
import type { FineRateProps } from "../../domain/fine-rate.ts";
import { CONFIG_SCOPE } from "../../domain/fine-rate-repository.ts";
import { type FineRateRepositoryFactory, kyselyFineRateRepository } from "../../infrastructure/fine-rate-repository.ts";

export function createGetFineRateHandler(
  repositoryFor: FineRateRepositoryFactory = kyselyFineRateRepository,
): UseCase<Record<string, never>, FineRateProps> {
  return {
    name: "config.get-fine-rate",
    scope: CONFIG_SCOPE,
    readOnly: true,
    allowedRoles: ["librarian", "student"],
    handle: async ({ trx }) => repositoryFor(trx).getCurrent(),
  };
}
