import { ProblemError } from "@biblioteca/core";
import { describe, expect, test } from "vitest";
import { AUDIT_READER_SCOPE, normalizeAuditFilter } from "./audit-query.ts";

describe("Regras de consulta à auditoria (domínio)", () => {
  test("define AUDIT_READER_SCOPE com papel audit_reader no schema audit", () => {
    expect(AUDIT_READER_SCOPE).toEqual({ role: "audit_reader", searchPath: "audit" });
  });

  test("[2.2] valida janela from/to apenas quando ambos informados, aceita fronteira única e limita página entre 1 e 100", () => {
    for (const bad of [
      { from: "2026-11-10T12:00:00.000Z", to: "2026-11-10T12:00:00.000Z", limit: 20 },
      { from: "2026-11-10T14:00:00.000Z", to: "2026-11-10T12:00:00.000Z", limit: 20 },
      { from: "data-invalida", to: "2026-11-10T12:00:00.000Z", limit: 20 },
    ]) {
      try {
        normalizeAuditFilter(bad);
        expect.fail("Deveria falhar na janela");
      } catch (err) {
        const p = err as ProblemError;
        expect(p).toBeInstanceOf(ProblemError);
        expect(p.code).toBe("validation-error");
        expect(p.detail).toBe("A janela informada para auditoria é inválida.");
        expect(p.errors).toEqual([{ field: "from", message: "parâmetro 'from' deve ser anterior a 'to'" }]);
      }
    }

    expect(normalizeAuditFilter({ from: "2026-11-10T10:00:00.000Z", limit: 0 }).limit).toBe(1);
    expect(normalizeAuditFilter({ to: "2026-11-10T12:00:00.000Z", limit: 10 }).limit).toBe(10);

    const ok = normalizeAuditFilter({
      from: "2026-11-10T10:00:00.000Z",
      to: "2026-11-10T12:00:00.000Z",
      limit: 250,
    });
    expect(ok.limit).toBe(100);
  });
});
