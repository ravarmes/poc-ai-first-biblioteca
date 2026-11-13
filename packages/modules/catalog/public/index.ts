// Fachada pública do módulo Acervo (ADR-0009, ADR-0015): em processo ou via HTTP no modo separado.
import type { InternalWorkSummary } from "@biblioteca/contract";
import { type AnyDatabase, ProblemError, runInUnitOfWork } from "@biblioteca/core";
import { CATALOG_SCOPE } from "../domain/work-repository.ts";
import { kyselyWorkRepository } from "../infrastructure/kysely-work-repository.ts";

export interface CatalogFacade {
  getWork(workId: string): Promise<InternalWorkSummary | null>;
  getWorksByIds(workIds: readonly string[]): Promise<ReadonlyMap<string, InternalWorkSummary>>;
}

function toSummary(work: {
  id: string;
  title: string;
  authors: readonly string[];
  subject: string;
  isbn: string | null;
}): InternalWorkSummary {
  return {
    id: work.id,
    title: work.title,
    authors: [...work.authors],
    subject: work.subject,
    isbn: work.isbn,
  };
}

export function createInProcessCatalogFacade(db: AnyDatabase): CatalogFacade {
  return {
    async getWork(workId: string): Promise<InternalWorkSummary | null> {
      if (!/^[0-9a-f-]{36}$/i.test(workId)) return null;
      return runInUnitOfWork(
        db,
        CATALOG_SCOPE,
        async (trx) => {
          const found = await kyselyWorkRepository(trx).findById(workId);
          return found ? toSummary(found) : null;
        },
        { readOnly: true },
      );
    },
    async getWorksByIds(workIds: readonly string[]): Promise<ReadonlyMap<string, InternalWorkSummary>> {
      const unique = [...new Set(workIds)];
      if (unique.length === 0) return new Map();
      const works = await runInUnitOfWork(
        db,
        CATALOG_SCOPE,
        async (trx) => kyselyWorkRepository(trx).findByIds(unique),
        { readOnly: true },
      );
      return new Map(works.map((w) => [w.id, toSummary(w)]));
    },
  };
}

export interface HttpCatalogClientOptions {
  readonly baseUrl: string;
  readonly serviceToken: string;
  readonly fetchFn?: typeof fetch;
}

export class CatalogHttpClient implements CatalogFacade {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetchFn: typeof fetch;

  constructor(options: HttpCatalogClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#token = options.serviceToken;
    this.#fetchFn = options.fetchFn ?? fetch;
  }

  async getWork(workId: string): Promise<InternalWorkSummary | null> {
    let response: Response;
    try {
      response = await this.#fetchFn(`${this.#baseUrl}/internal/v1/catalog/works/${encodeURIComponent(workId)}`, {
        headers: { Authorization: `Bearer ${this.#token}` },
      });
    } catch {
      throw new ProblemError("service-unavailable", { detail: "Módulo de Acervo indisponível." });
    }
    if (!response.ok) {
      if (response.status >= 500) {
        throw new ProblemError("service-unavailable", { detail: "Módulo de Acervo indisponível." });
      }
      throw new ProblemError("internal-error", { detail: "Falha ao consultar fachada do Acervo." });
    }
    const data = (await response.json()) as { work: InternalWorkSummary | null };
    return data.work;
  }

  async getWorksByIds(workIds: readonly string[]): Promise<ReadonlyMap<string, InternalWorkSummary>> {
    const unique = [...new Set(workIds)];
    if (unique.length === 0) return new Map();
    const map = new Map<string, InternalWorkSummary>();
    for (let i = 0; i < unique.length; i += 100) {
      const batch = unique.slice(i, i + 100);
      let response: Response;
      try {
        response = await this.#fetchFn(`${this.#baseUrl}/internal/v1/catalog/works/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.#token}`,
          },
          body: JSON.stringify({ ids: batch }),
        });
      } catch {
        throw new ProblemError("service-unavailable", { detail: "Módulo de Acervo indisponível." });
      }
      if (!response.ok) {
        throw new ProblemError(response.status >= 500 ? "service-unavailable" : "internal-error", {
          detail: "Falha ao consultar obras em lote no Acervo.",
        });
      }
      const data = (await response.json()) as { items: InternalWorkSummary[] };
      for (const item of data.items) {
        map.set(item.id, item);
      }
    }
    return map;
  }
}
