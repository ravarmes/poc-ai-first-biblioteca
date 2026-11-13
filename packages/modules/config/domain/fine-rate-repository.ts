import type { ModuleScope } from "@biblioteca/core";
import type { FineRateProps } from "./fine-rate.ts";

export const CONFIG_SCOPE: ModuleScope = { role: "mod_config", searchPath: "config" };

export interface FineRateRepository {
  getCurrent(): Promise<FineRateProps>;
  updateWithVersion(next: FineRateProps, expectedVersion: number): Promise<FineRateProps>;
}
