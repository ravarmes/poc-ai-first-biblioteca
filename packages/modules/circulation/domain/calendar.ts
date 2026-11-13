// Calendário Acadêmico (Conformista): cálculo de 14 dias letivos e contagem de atraso (spec 003, ADR-0006, RN-04).
import { ProblemError } from "@biblioteca/core";

export const DEFAULT_LOAN_SCHOOL_DAYS = 14;

export class SchoolCalendar {
  readonly #sortedSchoolDays: readonly string[];

  constructor(schoolDays: readonly string[]) {
    const valid = schoolDays.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    this.#sortedSchoolDays = [...new Set(valid)].sort();
  }

  get days(): readonly string[] {
    return this.#sortedSchoolDays;
  }

  /** Retorna a data de vencimento correspondente a `schoolDays` dias letivos estritamente após `startDateYmd`. */
  computeDueDate(startDateYmd: string, schoolDays: number = DEFAULT_LOAN_SCHOOL_DAYS): string {
    if (!Number.isInteger(schoolDays) || schoolDays < 1) {
      throw new ProblemError("validation-error", { detail: "Quantidade de dias letivos deve ser positiva." });
    }
    const following = this.#sortedSchoolDays.filter((d) => d > startDateYmd);
    const due = following[schoolDays - 1];
    if (!due) {
      throw new ProblemError("service-unavailable", {
        detail: "Calendário acadêmico sem dias letivos suficientes após a data de empréstimo.",
      });
    }
    return due;
  }
}

export function countOverdueDays(dueDateYmd: string, returnedDateYmd: string): number {
  if (returnedDateYmd <= dueDateYmd) {
    return 0;
  }
  const dueMs = Date.parse(`${dueDateYmd}T00:00:00.000Z`);
  const retMs = Date.parse(`${returnedDateYmd}T00:00:00.000Z`);
  if (Number.isNaN(dueMs) || Number.isNaN(retMs)) {
    throw new ProblemError("validation-error", { detail: "Formato de data inválido no cálculo de atraso." });
  }
  const diffDays = Math.round((retMs - dueMs) / 86_400_000);
  return Math.max(0, diffDays);
}
