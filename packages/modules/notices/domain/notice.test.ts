import { describe, expect, test } from "vitest";
import { buildHoldReadyNotice, formatHoldIdempotencyKey } from "./notice.ts";

describe("Domínio de Avisos (spec 004, ADR-0008, ADR-0024)", () => {
  test("[1.1] [1.2] gera chave idempotente res-<holdId> e texto em pt-BR quando há reserva", () => {
    const holdId = "0193b2c0-0000-7000-8000-000000000777";
    expect(formatHoldIdempotencyKey(holdId)).toBe(`res-${holdId}`);

    const withoutHold = buildHoldReadyNotice({
      eventId: "0193b2c0-0000-7000-8000-000000000001",
      schemaVersion: 1,
      occurredAt: "2026-11-10T10:00:00Z",
      copyId: "0193b2c0-0000-7000-8000-000000000002",
      barcode: "LIB-001",
      workId: "0193b2c0-0000-7000-8000-000000000003",
      workTitle: "Estruturas de Dados",
      assignedHold: null,
    });
    expect(withoutHold).toBeNull();

    const built = buildHoldReadyNotice({
      eventId: "0193b2c0-0000-7000-8000-000000000001",
      schemaVersion: 1,
      occurredAt: "2026-11-10T10:00:00Z",
      copyId: "0193b2c0-0000-7000-8000-000000000002",
      barcode: "LIB-001",
      workId: "0193b2c0-0000-7000-8000-000000000003",
      workTitle: "Estruturas de Dados",
      assignedHold: {
        holdId,
        studentId: "0193b2c0-0000-7000-8000-000000000004",
        studentRegistration: "2026-0001",
        recipientEmail: "aluno@alu.edu.br",
        expiresAt: "2026-11-13T10:00:00Z",
      },
    });
    expect(built).not.toBeNull();
    expect(built!.idempotencyKey).toBe(`res-${holdId}`);
    expect(built!.subject).toContain("Estruturas de Dados");
    expect(built!.body).toContain("LIB-001");
  });
});
