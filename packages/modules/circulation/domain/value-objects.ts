// Objetos de valor e relógio determinístico do módulo Circulação (ADR-0025, ADR-0028).
//
// Um objeto de valor não tem identidade: dois com o mesmo valor são o mesmo (`equals`). Ele é imutável e
// nasce válido: a fábrica `of` confere o valor e recusa o inválido, e por isso não circula código de barras,
// matrícula, e-mail ou dinheiro inválido pelo domínio. O construtor é privado; o `brand` privado impede que o
// TypeScript aceite um no lugar do outro só porque os dois guardam um `value`.
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

/** Código de barras do exemplar (ADR-0006): sem espaços nas pontas e em maiúsculas. */
export class Barcode {
  private readonly brand = "Barcode";

  private constructor(readonly value: string) {}

  static of(raw: string): Barcode {
    const value = raw.trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,32}$/.test(value)) {
      throw new ProblemError("validation-error", {
        detail: "Código de barras inválido.",
        errors: [{ field: "barcode", message: "deve ter entre 4 e 32 caracteres alfanuméricos ou hífen" }],
      });
    }
    return new Barcode(value);
  }

  equals(other: Barcode): boolean {
    return other.value === this.value;
  }
}

/** Matrícula acadêmica do aluno (o RA da Secretaria), sem espaços nas pontas. */
export class StudentRegistration {
  private readonly brand = "StudentRegistration";

  private constructor(readonly value: string) {}

  static of(raw: string): StudentRegistration {
    const value = raw.trim();
    if (!/^[A-Za-z0-9-]{3,32}$/.test(value)) {
      throw new ProblemError("validation-error", {
        detail: "Matrícula acadêmica inválida.",
        errors: [{ field: "studentRegistration", message: "deve ter entre 3 e 32 caracteres alfanuméricos ou hífen" }],
      });
    }
    return new StudentRegistration(value);
  }

  equals(other: StudentRegistration): boolean {
    return other.value === this.value;
  }
}

/**
 * E-mail do aluno. Nasce sem espaços nas pontas e com o domínio em minúsculas; a parte antes do @ fica como
 * veio, porque pela norma do e-mail (RFC 5321) só o domínio não diferencia maiúscula.
 */
export class Email {
  private readonly brand = "Email";

  private constructor(readonly value: string) {}

  static of(raw: string): Email {
    const value = raw.trim();
    if (!/^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(value)) {
      throw new ProblemError("validation-error", {
        detail: "E-mail inválido.",
        errors: [{ field: "email", message: "deve ter um @ e um domínio com ponto, sem espaços" }],
      });
    }
    return new Email(lowercaseDomain(value));
  }

  equals(other: Email): boolean {
    return other.value === this.value;
  }
}

function lowercaseDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return email.slice(0, at + 1) + email.slice(at + 1).toLowerCase();
}

/** Dinheiro em centavos inteiros (RN-04): sem fração de centavo e sem valor negativo. */
export class Money {
  private readonly brand = "Money";

  private constructor(readonly cents: number) {}

  static ofCents(cents: number): Money {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new ProblemError("validation-error", {
        detail: "Valor em dinheiro inválido: use centavos inteiros, sem valor negativo.",
      });
    }
    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0);
  }

  plus(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  times(factor: number): Money {
    return Money.ofCents(this.cents * factor);
  }

  equals(other: Money): boolean {
    return other.cents === this.cents;
  }

  /** O valor como se lê no balcão: `R$ 3,50`. */
  format(): string {
    return `R$ ${(this.cents / 100).toFixed(2).replace(".", ",")}`;
  }
}

export function addUtcDaysIso(baseIso: string, days: number): string {
  const ms = Date.parse(baseIso);
  if (Number.isNaN(ms)) {
    throw new ProblemError("internal-error", { detail: `Data ISO inválida no cálculo de prazo: ${baseIso}` });
  }
  return new Date(ms + days * 86_400_000).toISOString();
}
