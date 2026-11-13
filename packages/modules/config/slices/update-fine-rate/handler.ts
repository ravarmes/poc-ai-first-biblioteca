import type { UseCase } from "@biblioteca/core";
import { DEFAULT_FINE_RATE_ID, FineRate, type FineRateProps } from "../../domain/fine-rate.ts";
import { CONFIG_SCOPE } from "../../domain/fine-rate-repository.ts";
import { type FineRateRepositoryFactory, kyselyFineRateRepository } from "../../infrastructure/fine-rate-repository.ts";

export interface UpdateFineRateCommand {
  readonly dailyRateCents: number;
  readonly version: number;
}

export function createUpdateFineRateHandler(
  repositoryFor: FineRateRepositoryFactory = kyselyFineRateRepository,
): UseCase<UpdateFineRateCommand, FineRateProps> {
  return {
    name: "config.update-fine-rate",
    scope: CONFIG_SCOPE,
    allowedRoles: ["librarian"],
    handle: async ({ input, trx, emit }) => {
      const repo = repositoryFor(trx);
      const current = await repo.getCurrent();
      const { fineRate, changed, before, after } = FineRate.reconstitute(current).updateDailyRate(
        input.dailyRateCents,
        input.version,
      );
      if (!changed) return current;
      const saved = await repo.updateWithVersion(fineRate.props, input.version);
      emit({
        action: "fine_rate.updated",
        resourceType: "fine_rate",
        resourceId: DEFAULT_FINE_RATE_ID,
        changes: { dailyRateCents: { before, after } },
      });
      return saved;
    },
  };
}
