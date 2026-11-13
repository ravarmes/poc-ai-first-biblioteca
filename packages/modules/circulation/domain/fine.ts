// Entidade Multa (Fine) e cálculo determinístico por dias em atraso (RN-03, RN-04, RN-05).
import type { FineStatus } from "@biblioteca/contract";
import { newUuidV7, ProblemError } from "@biblioteca/core";
import { countOverdueDays } from "./calendar.ts";
import type { Money } from "./value-objects.ts";

export interface FineProps {
  readonly id: string;
  readonly studentId: string;
  readonly loanId: string;
  readonly overdueDays: number;
  readonly dailyRate: Money;
  readonly amount: Money;
  readonly status: FineStatus;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly version: number;
}

/** A multa é o valor diário vezes os dias em atraso (RN-03, RN-04). */
export function calculateOverdueFine(overdueDays: number, dailyRate: Money): Money {
  if (!Number.isInteger(overdueDays) || overdueDays < 1) {
    throw new ProblemError("validation-error", { detail: "Dias em atraso devem ser inteiros positivos." });
  }
  if (dailyRate.cents < 1) {
    throw new ProblemError("validation-error", { detail: "Valor diário da multa deve ser inteiro positivo em centavos." });
  }
  return dailyRate.times(overdueDays);
}

export class Fine {
  readonly #props: FineProps;

  private constructor(props: FineProps) {
    this.#props = props;
  }

  static createIfOverdue(input: {
    studentId: string;
    loanId: string;
    dueDateYmd: string;
    returnedDateYmd: string;
    dailyRate: Money;
    nowIso: string;
  }): Fine | null {
    const overdueDays = countOverdueDays(input.dueDateYmd, input.returnedDateYmd);
    if (overdueDays <= 0) {
      return null;
    }
    const amount = calculateOverdueFine(overdueDays, input.dailyRate);
    return new Fine({
      id: newUuidV7(),
      studentId: input.studentId,
      loanId: input.loanId,
      overdueDays,
      dailyRate: input.dailyRate,
      amount,
      status: "pending",
      createdAt: input.nowIso,
      paidAt: null,
      version: 1,
    });
  }

  static reconstitute(props: FineProps): Fine {
    return new Fine(props);
  }

  get props(): FineProps {
    return this.#props;
  }

  pay(expectedVersion: number, nowIso: string): Fine {
    if (this.#props.status === "paid") {
      throw new ProblemError("fine-already-paid", {
        detail: "Esta multa já foi quitada anteriormente.",
      });
    }
    if (this.#props.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "A multa foi atualizada por outra operação; recarregue antes de quitar.",
        currentVersion: this.#props.version,
      });
    }
    return new Fine({
      ...this.#props,
      status: "paid",
      paidAt: nowIso,
      version: this.#props.version + 1,
    });
  }
}
