// Porta do repositório de obras (Clean Architecture: domain define a interface sem acoplamento a SQL).
import type { ModuleScope, PageResult } from "@biblioteca/core";
import type { WorkProps } from "./work.ts";

export const CATALOG_SCOPE: ModuleScope = { role: "mod_catalog", searchPath: "catalog" };

export interface SearchWorksFilter {
  readonly q?: string;
  readonly subject?: string;
  readonly limit: number;
  readonly cursor?: string;
}

export interface WorkRepository {
  insert(work: WorkProps): Promise<WorkProps>;
  updateWithVersion(work: WorkProps, expectedVersion: number): Promise<WorkProps>;
  findById(workId: string): Promise<WorkProps | null>;
  findByIds(workIds: readonly string[]): Promise<WorkProps[]>;
  search(filter: SearchWorksFilter): Promise<PageResult<WorkProps>>;
}
