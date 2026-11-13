// Unidade de trabalho com fronteira de módulo no PostgreSQL (ADR-0016, ADR-0022).
import { type Kysely, sql, type Transaction } from "kysely";
import type { AnyDatabase } from "./database.ts";

export interface ModuleScope {
  readonly role: string;
  readonly searchPath: string;
}

export interface UnitOfWorkOptions {
  readonly readOnly?: boolean;
}

export function isPlainIdentifier(value: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(value);
}

export function assertScope(scope: ModuleScope): void {
  if (!isPlainIdentifier(scope.role)) {
    throw new Error(`role de módulo inválida: ${JSON.stringify(scope.role)}`);
  }
  if (!scope.searchPath.split(",").every((s) => isPlainIdentifier(s.trim()))) {
    throw new Error(`search_path inválido: ${JSON.stringify(scope.searchPath)}`);
  }
}

export async function runInUnitOfWork<T, DB = unknown>(
  db: AnyDatabase,
  scope: ModuleScope,
  fn: (trx: Transaction<DB>) => Promise<T>,
  options: UnitOfWorkOptions = {},
): Promise<T> {
  assertScope(scope);
  const builder = options.readOnly ? db.transaction().setAccessMode("read only") : db.transaction();
  return builder.execute(async (trx) => {
    await sql`SELECT set_config('search_path', ${scope.searchPath}, true), set_config('role', ${scope.role}, true)`.execute(trx);
    return fn(trx as unknown as Transaction<DB>);
  });
}

export function typed<DB>(trx: Kysely<unknown> | AnyDatabase): Kysely<DB> {
  return trx as unknown as Kysely<DB>;
}
