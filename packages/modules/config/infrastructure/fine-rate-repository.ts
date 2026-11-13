import { ProblemError, typed } from "@biblioteca/core";
import { type Kysely, sql } from "kysely";
import { DEFAULT_FINE_RATE_ID, FineRate, type FineRateProps } from "../domain/fine-rate.ts";
import type { FineRateRepository } from "../domain/fine-rate-repository.ts";

export type FineRateRepositoryFactory = (trx: Kysely<unknown>) => FineRateRepository;

interface FineRateRow {
  readonly id: string;
  readonly daily_rate_cents: number;
  readonly version: number;
  readonly updated_at: Date | string;
}

interface ConfigDb {
  "config.fine_rates": FineRateRow;
}

function mapRow(row: FineRateRow): FineRateProps {
  return {
    id: row.id,
    dailyRateCents: row.daily_rate_cents,
    version: row.version,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  };
}

export class InMemoryFineRateRepository implements FineRateRepository {
  current: FineRateProps = FineRate.defaultSeed().props;

  async getCurrent(): Promise<FineRateProps> {
    return this.current;
  }

  async updateWithVersion(next: FineRateProps, expectedVersion: number): Promise<FineRateProps> {
    if (this.current.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "O valor diário da multa foi alterado por outra pessoa; recarregue para continuar.",
        currentVersion: this.current.version,
      });
    }
    this.current = next;
    return this.current;
  }
}

export class KyselyFineRateRepository implements FineRateRepository {
  readonly #trx: Kysely<ConfigDb>;

  constructor(trx: Kysely<unknown>) {
    this.#trx = typed<ConfigDb>(trx);
  }

  async getCurrent(): Promise<FineRateProps> {
    const res = await sql<FineRateRow>`
      SELECT id, daily_rate_cents, version, updated_at
      FROM config.fine_rates
      WHERE id = ${DEFAULT_FINE_RATE_ID}
      LIMIT 1
    `.execute(this.#trx);

    const row = res.rows[0];
    if (row) return mapRow(row);
    return FineRate.defaultSeed().props;
  }

  async updateWithVersion(next: FineRateProps, expectedVersion: number): Promise<FineRateProps> {
    const res = await sql<FineRateRow>`
      UPDATE config.fine_rates
      SET
        daily_rate_cents = ${next.dailyRateCents},
        version = version + 1,
        updated_at = ${next.updatedAt}::timestamptz
      WHERE id = ${DEFAULT_FINE_RATE_ID} AND version = ${expectedVersion}
      RETURNING id, daily_rate_cents, version, updated_at
    `.execute(this.#trx);

    const updated = res.rows[0];
    if (updated) return mapRow(updated);

    const current = await this.getCurrent();
    throw new ProblemError("version-conflict", {
      detail: "O valor diário da multa foi alterado por outra pessoa; recarregue para continuar.",
      currentVersion: current.version,
    });
  }
}

export const kyselyFineRateRepository: FineRateRepositoryFactory = (trx) => new KyselyFineRateRepository(trx);
