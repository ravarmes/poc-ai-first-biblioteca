// Entidade Multa (Fine) e cálculo determinístico por dias em atraso (RN-03, RN-04, RN-05).
import type { FineDto, FineStatus } from "@biblioteca/contract";
import { newUuidV7, ProblemError } from "@biblioteca/core";
import { countOverdueDays } from "./calendar.ts";

export interface FineProps {
  readonly id: string;
  readonly studentId: string;
  readonly loanId: string;
  readonly overdueDays: number;
  readonly dailyRateCents: number;
  readonly amountCents: number;
  readonly status: FineStatus;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly version: number;
}

export function calculateOverdueFine(overdueDays: number, dailyRateCents: number): number {
  if (!Number.isInteger(overdueDays) || overdueDays < 1) {
    throw new ProblemError("validation-error", { detail: "Dias em atraso devem ser inteiros positivos." });
  }
  if (!Number.isInteger(dailyRateCents) || dailyRateCents < 1) {
    throw new ProblemError("validation-error", { detail: "Valor diário da multa deve ser inteiro positivo em centavos." });
  }
  return overdueDays * dailyRateCents;
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
    dailyRateCents: number;
    nowIso: string;
  }): Fine | null {
    const overdueDays = countOverdueDays(input.dueDateYmd, input.returnedDateYmd);
    if (overdueDays <= 0) {
      return null;
    }
    const amountCents = calculateOverdueFine(overdueDays, input.dailyRateCents);
    return new Fine({
      id: newUuidV7(),
      studentId: input.studentId,
      loanId: input.loanId,
      overdueDays,
      dailyRateCents: input.dailyRateCents,
      amountCents,
      status: "pending",
      createdAt: input.nowIso,
      paidAt: null,
      version: 1,
    });
  }

  static reconstitute(props: FineProps): Fine {
    return new Fine(props);
  }

  get props(): FineDto {
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
