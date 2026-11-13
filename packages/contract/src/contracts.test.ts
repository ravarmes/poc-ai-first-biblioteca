import { describe, expect, test } from "vitest";
import {
  BarcodeSchema,
  CopyReturnedEventV1Schema,
  CreateWorkRequestSchema,
  ListAuditEventsQuerySchema,
  UpdateFineRateRequestSchema,
} from "./index.ts";

describe("Contratos Zod compartilhados (@biblioteca/contract)", () => {
  test("normaliza código de barras e rejeita campos extras (strict)", () => {
    expect(BarcodeSchema.parse("  lib-001  ")).toBe("LIB-001");
    expect(() =>
      CreateWorkRequestSchema.parse({
        title: "Clean Architecture",
        authors: ["Robert C. Martin"],
        subject: "Engenharia de Software",
        extraField: true,
      }),
    ).toThrow();
  });

  test("valida faixa inteira da multa diária e janela temporal de auditoria", () => {
    expect(UpdateFineRateRequestSchema.parse({ dailyRateCents: 100, version: 1 })).toEqual({
      dailyRateCents: 100,
      version: 1,
    });
    expect(() => UpdateFineRateRequestSchema.parse({ dailyRateCents: 0, version: 1 })).toThrow();
    expect(() =>
      ListAuditEventsQuerySchema.parse({
        from: "2026-11-10T12:00:00Z",
        to: "2026-11-10T11:00:00Z",
      }),
    ).toThrow();
  });

  test("valida payload de evento CopyReturned v1", () => {
    const parsed = CopyReturnedEventV1Schema.parse({
      eventId: "0193b2c0-0000-7000-8000-000000000001",
      schemaVersion: 1,
      occurredAt: "2026-11-10T14:00:00Z",
      copyId: "0193b2c0-0000-7000-8000-000000000002",
      barcode: "lib-101",
      workId: "0193b2c0-0000-7000-8000-000000000003",
      workTitle: "Domain-Driven Design",
      assignedHold: null,
    });
    expect(parsed.barcode).toBe("LIB-101");
  });
});
