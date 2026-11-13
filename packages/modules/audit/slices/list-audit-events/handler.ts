// Caso de uso audit.list-audit-events (spec 005 [2.1]-[2.3], ADR-0012, ADR-0016).
import type { AuditEventDto } from "@biblioteca/contract";
import type { PageResult, UseCase } from "@biblioteca/core";
import { AUDIT_READER_SCOPE, type AuditFilter, normalizeAuditFilter } from "../../domain/audit-query.ts";
import { type AuditReaderFactory, kyselyAuditReader } from "../../infrastructure/kysely-audit-reader.ts";

export function createListAuditEventsHandler(
  readerFor: AuditReaderFactory = kyselyAuditReader,
): UseCase<AuditFilter, PageResult<AuditEventDto>, AuditFilter> {
  return {
    name: "audit.list-audit-events",
    scope: AUDIT_READER_SCOPE,
    readOnly: true,
    allowedRoles: ["librarian"],
    prepare: async ({ input }) => normalizeAuditFilter(input),
    handle: async ({ prepared, trx }) => readerFor(trx).list(prepared),
  };
}
