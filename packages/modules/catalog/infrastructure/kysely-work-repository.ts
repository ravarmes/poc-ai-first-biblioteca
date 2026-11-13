// Repositório PostgreSQL (schema catalog, role mod_catalog) via Kysely.
import { decodeCursor, type PageResult, ProblemError, toPage, typed } from "@biblioteca/core";
import { type Kysely, sql } from "kysely";
import type { WorkProps } from "../domain/work.ts";
import type { SearchWorksFilter, WorkRepository } from "../domain/work-repository.ts";

export type WorkRepositoryFactory = (trx: Kysely<unknown>) => WorkRepository;

interface WorkRow {
  readonly id: string;
  readonly title: string;
  readonly authors: unknown;
  readonly subject: string;
  readonly isbn: string | null;
  readonly version: number;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface CatalogDb {
  "catalog.works": WorkRow;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: WorkRow): WorkProps {
  const parsedAuthors =
    typeof row.authors === "string" ? (JSON.parse(row.authors) as string[]) : (row.authors as string[]);
  return {
    id: row.id,
    title: row.title,
    authors: parsedAuthors,
    subject: row.subject,
    isbn: row.isbn,
    version: row.version,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function isPgUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export class KyselyWorkRepository implements WorkRepository {
  readonly #trx: Kysely<CatalogDb>;

  constructor(trx: Kysely<unknown>) {
    this.#trx = typed<CatalogDb>(trx);
  }

  async insert(work: WorkProps): Promise<WorkProps> {
    try {
      const res = await sql<WorkRow>`
        INSERT INTO catalog.works (id, title, authors, subject, isbn, version, created_at, updated_at)
        VALUES (
          ${work.id}::uuid,
          ${work.title},
          ${JSON.stringify(work.authors)}::jsonb,
          ${work.subject},
          ${work.isbn},
          ${work.version},
          ${work.createdAt}::timestamptz,
          ${work.updatedAt}::timestamptz
        )
        RETURNING id, title, authors, subject, isbn, version, created_at, updated_at
      `.execute(this.#trx);
      return mapRow(res.rows[0]!);
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new ProblemError("isbn-taken", { detail: `Já existe obra cadastrada com o ISBN ${work.isbn}.` });
      }
      throw error;
    }
  }

  async updateWithVersion(work: WorkProps, expectedVersion: number): Promise<WorkProps> {
    try {
      const res = await sql<WorkRow>`
        UPDATE catalog.works
        SET
          title = ${work.title},
          authors = ${JSON.stringify(work.authors)}::jsonb,
          subject = ${work.subject},
          isbn = ${work.isbn},
          version = version + 1,
          updated_at = ${work.updatedAt}::timestamptz
        WHERE id = ${work.id}::uuid AND version = ${expectedVersion}
        RETURNING id, title, authors, subject, isbn, version, created_at, updated_at
      `.execute(this.#trx);

      const updated = res.rows[0];
      if (updated) return mapRow(updated);

      const existing = await this.findById(work.id);
      if (!existing) {
        throw new ProblemError("not-found", { detail: "Obra não encontrada." });
      }
      throw new ProblemError("version-conflict", {
        detail: "Esta obra foi alterada por outra pessoa; recarregue para continuar.",
        currentVersion: existing.version,
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new ProblemError("isbn-taken", { detail: `Já existe outra obra com o ISBN ${work.isbn}.` });
      }
      throw error;
    }
  }

  async findById(workId: string): Promise<WorkProps | null> {
    const res = await sql<WorkRow>`
      SELECT id, title, authors, subject, isbn, version, created_at, updated_at
      FROM catalog.works
      WHERE id = ${workId}::uuid
      LIMIT 1
    `.execute(this.#trx);
    const row = res.rows[0];
    return row ? mapRow(row) : null;
  }

  async findByIds(workIds: readonly string[]): Promise<WorkProps[]> {
    if (workIds.length === 0) return [];
    const valid = workIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (valid.length === 0) return [];
    const idParams = sql.join(valid.map((id) => sql`${id}::uuid`));
    const res = await sql<WorkRow>`
      SELECT id, title, authors, subject, isbn, version, created_at, updated_at
      FROM catalog.works
      WHERE id IN (${idParams})
      ORDER BY id ASC
    `.execute(this.#trx);
    return res.rows.map(mapRow);
  }

  async search(filter: SearchWorksFilter): Promise<PageResult<WorkProps>> {
    const cursorId = filter.cursor ? decodeCursor(filter.cursor).id : null;
    const conditions = [];

    if (filter.q && filter.q.trim().length > 0) {
      const pattern = `%${escapeLikePattern(filter.q.trim())}%`;
      conditions.push(sql`(
        title ILIKE ${pattern} ESCAPE '\\'
        OR subject ILIKE ${pattern} ESCAPE '\\'
        OR coalesce(isbn, '') ILIKE ${pattern} ESCAPE '\\'
        OR authors::text ILIKE ${pattern} ESCAPE '\\'
      )`);
    }

    if (filter.subject && filter.subject.trim().length > 0) {
      const subjectPattern = `%${escapeLikePattern(filter.subject.trim())}%`;
      conditions.push(sql`subject ILIKE ${subjectPattern} ESCAPE '\\'`);
    }

    if (cursorId) {
      conditions.push(sql`id < ${cursorId}::uuid`);
    }

    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
    const fetchLimit = filter.limit + 1;

    const res = await sql<WorkRow>`
      SELECT id, title, authors, subject, isbn, version, created_at, updated_at
      FROM catalog.works
      ${whereClause}
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `.execute(this.#trx);

    return toPage(res.rows.map(mapRow), filter.limit);
  }
}

export const kyselyWorkRepository: WorkRepositoryFactory = (trx) => new KyselyWorkRepository(trx);
