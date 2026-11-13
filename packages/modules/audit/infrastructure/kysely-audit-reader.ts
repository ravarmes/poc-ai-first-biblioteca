import type { AuditEventDto, AuditResult } from "@biblioteca/contract";
import { decodeCursor, type PageResult, toPage, typed } from "@biblioteca/core";
import { type Kysely, sql } from "kysely";
import type { AuditFilter, AuditReader } from "../domain/audit-query.ts";

export type AuditReaderFactory = (trx: Kysely<unknown>) => AuditReader;

export class InMemoryAuditReader implements AuditReader {
  readonly items: AuditEventDto[] = [];

  seed(events: readonly AuditEventDto[]): void {
    this.items.push(...events);
  }

  async list(filter: AuditFilter): Promise<PageResult<AuditEventDto>> {
    const cursorId = filter.cursor ? decodeCursor(filter.cursor).id : undefined;
    const fromMs = filter.from ? Date.parse(filter.from) : undefined;
    const toMs = filter.to ? Date.parse(filter.to) : undefined;

    const filtered = this.items
      .filter((ev) => {
        if (filter.action && ev.action !== filter.action) return false;
        if (filter.actorId && ev.actorId !== filter.actorId) return false;
        if (filter.resourceType && ev.resourceType !== filter.resourceType) return false;
        if (filter.resourceId && ev.resourceId !== filter.resourceId) return false;
        if (filter.result && ev.result !== filter.result) return false;
        const occurredMs = Date.parse(ev.occurredAt);
        if (fromMs !== undefined && occurredMs < fromMs) return false;
        if (toMs !== undefined && occurredMs >= toMs) return false;
        if (cursorId && ev.id >= cursorId) return false;
        return true;
      })
      .sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));

    return toPage(filtered, filter.limit);
  }
}

interface AuditEventRow {
  readonly id: string;
  readonly occurred_at: Date | string;
  readonly request_id: string;
  readonly actor_id: string | null;
  readonly actor_role: string | null;
  readonly action: string;
  readonly resource_type: string;
  readonly resource_id: string | null;
  readonly result: AuditResult;
  readonly reason: string | null;
  readonly changes: Record<string, unknown> | string | null;
}

interface AuditDb {
  "audit.events": AuditEventRow;
}

function mapRow(row: AuditEventRow): AuditEventDto {
  const parsedChanges =
    typeof row.changes === "string"
      ? (JSON.parse(row.changes) as Record<string, unknown>)
      : row.changes;
  return {
    id: row.id,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : new Date(row.occurred_at).toISOString(),
    requestId: row.request_id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    result: row.result,
    reason: row.reason,
    changes: parsedChanges ?? null,
  };
}

export class KyselyAuditReader implements AuditReader {
  readonly #trx: Kysely<AuditDb>;

  constructor(trx: Kysely<unknown>) {
    this.#trx = typed<AuditDb>(trx);
  }

  async list(filter: AuditFilter): Promise<PageResult<AuditEventDto>> {
    const cursorId = filter.cursor ? decodeCursor(filter.cursor).id : null;
    const conditions = [];

    if (filter.action) conditions.push(sql`action = ${filter.action}`);
    if (filter.actorId) conditions.push(sql`actor_id = ${filter.actorId}::uuid`);
    if (filter.resourceType) conditions.push(sql`resource_type = ${filter.resourceType}`);
    if (filter.resourceId) conditions.push(sql`resource_id = ${filter.resourceId}`);
    if (filter.result) conditions.push(sql`result = ${filter.result}`);
    if (filter.from) conditions.push(sql`occurred_at >= ${filter.from}::timestamptz`);
    if (filter.to) conditions.push(sql`occurred_at < ${filter.to}::timestamptz`);
    if (cursorId) conditions.push(sql`id < ${cursorId}::uuid`);

    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
    const fetchLimit = filter.limit + 1;

    const res = await sql<AuditEventRow>`
      SELECT id, occurred_at, request_id, actor_id, actor_role, action, resource_type, resource_id, result, reason, changes
      FROM audit.events
      ${whereClause}
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `.execute(this.#trx);

    return toPage(res.rows.map(mapRow), filter.limit);
  }
}

export const kyselyAuditReader: AuditReaderFactory = (trx) => new KyselyAuditReader(trx);
