// Escritor atômico da trilha de auditoria em `audit.events` (ADR-0012, ADR-0013).
import type { AuditResult } from "@biblioteca/contract";
import { type Kysely, sql } from "kysely";
import { newUuidV7 } from "../ids.ts";

export interface AuditEventInput {
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string | null;
  readonly actorId?: string | null;
  readonly actorRole?: string | null;
  readonly result?: AuditResult;
  readonly reason?: string | null;
  readonly changes?: Record<string, unknown> | null;
  readonly requestId?: string;
  readonly traceId?: string | null;
}

export async function writeAuditEvents(trx: Kysely<unknown>, events: readonly AuditEventInput[]): Promise<void> {
  for (const event of events) {
    const id = newUuidV7();
    const requestId = event.requestId ?? id;
    const changesJson = event.changes ? JSON.stringify(event.changes) : null;
    await sql`
      INSERT INTO audit.events (
        id, request_id, actor_id, actor_role, action, resource_type, resource_id, result, reason, changes, trace_id
      ) VALUES (
        ${id}::uuid,
        ${requestId},
        ${event.actorId ?? null}::uuid,
        ${event.actorRole ?? null},
        ${event.action},
        ${event.resourceType},
        ${event.resourceId ?? null},
        ${event.result ?? "success"},
        ${event.reason ?? null},
        ${changesJson}::jsonb,
        ${event.traceId ?? null}
      )
    `.execute(trx);
  }
}
