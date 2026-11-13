import { type AnyDatabase, runInUnitOfWork } from "@biblioteca/core";
import { CONFIG_SCOPE } from "../domain/fine-rate-repository.ts";
import { kyselyFineRateRepository } from "../infrastructure/fine-rate-repository.ts";
import { createGetFineRateHandler } from "../slices/get-fine-rate/handler.ts";
import { createUpdateFineRateHandler } from "../slices/update-fine-rate/handler.ts";

export interface FineRateFacade {
  currentDailyRateCents(): Promise<number>;
}

export function createInProcessFineRateFacade(db: AnyDatabase): FineRateFacade {
  return {
    async currentDailyRateCents(): Promise<number> {
      const current = await runInUnitOfWork(
        db,
        CONFIG_SCOPE,
        (trx) => kyselyFineRateRepository(trx).getCurrent(),
        { readOnly: true },
      );
      return current.dailyRateCents;
    },
  };
}

export function createInProcessConfigHandlers() {
  return {
    getFineRate: createGetFineRateHandler(),
    updateFineRate: createUpdateFineRateHandler(),
  };
}
