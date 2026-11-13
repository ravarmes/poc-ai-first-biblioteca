// Domínio e porta de consulta à trilha de auditoria (spec 005, ADR-0012, ADR-0016).
import type { AuditEventDto, AuditResult } from "@biblioteca/contract";
import { type ModuleScope, type PageResult, ProblemError } from "@biblioteca/core";

export const AUDIT_READER_SCOPE: ModuleScope = {
  role: "audit_reader",
  searchPath: "audit",
};

export interface AuditFilter {
  readonly action?: string;
  readonly actorId?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly result?: AuditResult;
  readonly from?: string;
  readonly to?: string;
  readonly limit: number;
  readonly cursor?: string;
}

export function normalizeAuditFilter(input: AuditFilter): AuditFilter {
  if (input.from && input.to) {
    const fromMs = Date.parse(input.from);
    const toMs = Date.parse(input.to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs >= toMs) {
      throw new ProblemError("validation-error", {
        detail: "A janela informada para auditoria é inválida.",
        errors: [{ field: "from", message: "parâmetro 'from' deve ser anterior a 'to'" }],
      });
    }
  }
  return {
    ...input,
    limit: Math.min(100, Math.max(1, Math.trunc(input.limit))),
  };
}

export interface AuditReader {
  list(filter: AuditFilter): Promise<PageResult<AuditEventDto>>;
}
