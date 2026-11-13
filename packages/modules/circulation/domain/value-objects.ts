// Objetos de valor e relógio determinístico do módulo Circulação (ADR-0028).
import { ProblemError } from "@biblioteca/core";

export interface ClockPort {
  nowIso(): string;
  todayYmd(): string;
}

export class SystemClock implements ClockPort {
  nowIso(): string {
    return new Date().toISOString();
  }

  todayYmd(): string {
    return this.nowIso().slice(0, 10);
  }
}

export class FixedClock implements ClockPort {
  #currentIso: string;

  constructor(isoUtc: string) {
    this.#currentIso = new Date(isoUtc).toISOString();
  }

  setNow(isoUtc: string): void {
    this.#currentIso = new Date(isoUtc).toISOString();
  }

  advanceDays(days: number): void {
    const next = new Date(Date.parse(this.#currentIso) + days * 86_400_000);
    this.#currentIso = next.toISOString();
  }

  nowIso(): string {
    return this.#currentIso;
  }

  todayYmd(): string {
    return this.#currentIso.slice(0, 10);
  }
}

export function normalizeBarcode(raw: string): string {
  const normalized = raw.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,32}$/.test(normalized)) {
    throw new ProblemError("validation-error", {
      detail: "Código de barras inválido.",
      errors: [{ field: "barcode", message: "deve ter entre 4 e 32 caracteres alfanuméricos ou hífen" }],
    });
  }
  return normalized;
}

export function normalizeRegistration(raw: string): string {
  const normalized = raw.trim();
  if (!/^[A-Za-z0-9-]{3,32}$/.test(normalized)) {
    throw new ProblemError("validation-error", {
      detail: "Matrícula acadêmica inválida.",
      errors: [{ field: "studentRegistration", message: "deve ter entre 3 e 32 caracteres alfanuméricos ou hífen" }],
    });
  }
  return normalized;
}

export function addUtcDaysIso(baseIso: string, days: number): string {
  const ms = Date.parse(baseIso);
  if (Number.isNaN(ms)) {
    throw new ProblemError("internal-error", { detail: `Data ISO inválida no cálculo de prazo: ${baseIso}` });
  }
  return new Date(ms + days * 86_400_000).toISOString();
}

export function formatCentsBrl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}
