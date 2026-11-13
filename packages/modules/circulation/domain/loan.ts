// Entidade Empréstimo (Loan) e regras de renovação e devolução (spec 003).
import type { LoanStatus } from "@biblioteca/contract";
import { newUuidV7, ProblemError } from "@biblioteca/core";

export interface LoanProps {
  readonly id: string;
  readonly copyId: string;
  readonly studentId: string;
  readonly workId: string;
  readonly loanDate: string;
  readonly dueDate: string;
  readonly returnedAt: string | null;
  readonly renewalsCount: number;
  readonly status: LoanStatus;
  readonly version: number;
}

export class Loan {
  readonly #props: LoanProps;

  private constructor(props: LoanProps) {
    this.#props = props;
  }

  static open(input: {
    copyId: string;
    studentId: string;
    workId: string;
    loanDate: string;
    dueDate: string;
  }): Loan {
    return new Loan({
      id: newUuidV7(),
      copyId: input.copyId,
      studentId: input.studentId,
      workId: input.workId,
      loanDate: input.loanDate,
      dueDate: input.dueDate,
      returnedAt: null,
      renewalsCount: 0,
      status: "open",
      version: 1,
    });
  }

  static reconstitute(props: LoanProps): Loan {
    return new Loan(props);
  }

  get props(): LoanProps {
    return this.#props;
  }

  renew(newDueDate: string, expectedVersion: number): Loan {
    if (this.#props.status !== "open") {
      throw new ProblemError("no-active-loan", {
        detail: "Empréstimos já devolvidos não podem ser renovados.",
      });
    }
    if (this.#props.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "Este empréstimo foi modificado em paralelo; recarregue os dados.",
        currentVersion: this.#props.version,
      });
    }
    return new Loan({
      ...this.#props,
      dueDate: newDueDate,
      renewalsCount: this.#props.renewalsCount + 1,
      version: this.#props.version + 1,
    });
  }

  close(returnedDateYmd: string): Loan {
    if (this.#props.status !== "open") {
      throw new ProblemError("no-active-loan", {
        detail: "Este empréstimo já foi encerrado anteriormente.",
      });
    }
    return new Loan({
      ...this.#props,
      status: "returned",
      returnedAt: returnedDateYmd,
      version: this.#props.version + 1,
    });
  }
}
