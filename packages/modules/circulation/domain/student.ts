// Agregado raiz Aluno (Student) no contexto de Circulação (RN-01, RN-02, RN-03, spec 003, ADR-0025).
// A raiz guarda os empréstimos em aberto (Loan) e as multas pendentes (Fine) do aluno: para emprestar, o
// caso de uso busca o Student inteiro, pede à raiz (`borrow`), que confere as regras, e grava o Student
// inteiro, numa transação, só se a versão ainda for a lida. O exemplar (Copy) é outro agregado: o
// empréstimo guarda só o `copyId`.
import { newUuidV7, ProblemError } from "@biblioteca/core";
import { Fine, type FineProps } from "./fine.ts";
import { Loan, type LoanProps } from "./loan.ts";
import { normalizeRegistration } from "./value-objects.ts";

export const STUDENT_LOAN_LIMIT = 3;

export interface AcademicStudent {
  readonly registration: string;
  readonly name: string;
  readonly email: string;
  readonly enrollmentStatus: "active" | "inactive";
  readonly rawStatus: string;
  readonly courseCode: string;
}

export interface StudentProps {
  readonly id: string;
  readonly registration: string;
  readonly name: string;
  readonly email: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** O que fica dentro do agregado, além do aluno: os empréstimos em aberto e as multas pendentes. */
export interface StudentParts {
  readonly openLoans: readonly LoanProps[];
  readonly pendingFines: readonly FineProps[];
}

/** Os dados do empréstimo pedido à raiz: o exemplar (só pelo id), a obra e as datas já calculadas. */
export interface BorrowRequest {
  readonly copyId: string;
  readonly workId: string;
  readonly loanDate: string;
  readonly dueDate: string;
}

export class Student {
  readonly #props: StudentProps;
  readonly #openLoans: readonly Loan[];
  readonly #pendingFines: readonly Fine[];

  private constructor(props: StudentProps, openLoans: readonly Loan[], pendingFines: readonly Fine[]) {
    this.#props = props;
    this.#openLoans = openLoans;
    this.#pendingFines = pendingFines;
  }

  /** Aluno novo, vindo da Secretaria: ainda sem empréstimos nem multas. */
  static fromAcademic(academic: AcademicStudent, nowIso: string): Student {
    return new Student(
      {
        id: newUuidV7(),
        registration: normalizeRegistration(academic.registration),
        name: academic.name.trim(),
        email: academic.email.trim().toLowerCase(),
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      [],
      [],
    );
  }

  /** O agregado lido do banco: o aluno com os empréstimos em aberto e as multas pendentes dele. */
  static reconstitute(props: StudentProps, parts: StudentParts): Student {
    return new Student(
      props,
      parts.openLoans.map((loan) => Loan.reconstitute(loan)),
      parts.pendingFines.map((fine) => Fine.reconstitute(fine)),
    );
  }

  get props(): StudentProps {
    return this.#props;
  }

  get openLoans(): readonly Loan[] {
    return this.#openLoans;
  }

  get pendingFines(): readonly Fine[] {
    return this.#pendingFines;
  }

  syncWithAcademic(academic: AcademicStudent, nowIso: string): Student {
    const nextName = academic.name.trim();
    const nextEmail = academic.email.trim().toLowerCase();
    if (nextName === this.#props.name && nextEmail === this.#props.email) {
      return this;
    }
    return new Student(
      {
        ...this.#props,
        name: nextName,
        email: nextEmail,
        version: this.#props.version + 1,
        updatedAt: nowIso,
      },
      this.#openLoans,
      this.#pendingFines,
    );
  }

  /**
   * Empresta um exemplar ao aluno: com multa pendente, recusa (RN-01); com 3 empréstimos em aberto, recusa
   * (RN-02). Senão, abre o empréstimo dentro do agregado e sobe a versão. Devolve o Student como fica e o
   * empréstimo novo; nada é gravado aqui (quem grava é o repositório, com o Student inteiro).
   */
  borrow(request: BorrowRequest, nowIso: string): { readonly student: Student; readonly loan: Loan } {
    if (this.#pendingFines.length > 0) {
      throw new ProblemError("pending-fine", {
        detail: `O aluno ${this.#props.name} (${this.#props.registration}) possui multa pendente e não pode retirar exemplares.`,
      });
    }
    if (this.#openLoans.length >= STUDENT_LOAN_LIMIT) {
      throw new ProblemError("loan-limit-reached", {
        detail: `O aluno ${this.#props.name} já atingiu o limite de ${STUDENT_LOAN_LIMIT} empréstimos em aberto.`,
      });
    }
    const loan = Loan.open({
      copyId: request.copyId,
      studentId: this.#props.id,
      workId: request.workId,
      loanDate: request.loanDate,
      dueDate: request.dueDate,
    });
    const student = new Student(
      { ...this.#props, version: this.#props.version + 1, updatedAt: nowIso },
      [...this.#openLoans, loan],
      this.#pendingFines,
    );
    return { student, loan };
  }

  /** Renovar pede o aluno sem multa pendente (RN-01). */
  ensureCanRenew(): void {
    if (this.#pendingFines.length > 0) {
      throw new ProblemError("pending-fine", {
        detail: `O aluno ${this.#props.name} possui multa pendente; regularize antes de renovar.`,
      });
    }
  }

  ensureCanPlaceHold(hasActiveHoldForWork: boolean): void {
    if (hasActiveHoldForWork) {
      throw new ProblemError("hold-already-exists", {
        detail: `O aluno ${this.#props.registration} já possui uma reserva ativa para esta obra.`,
      });
    }
  }
}
