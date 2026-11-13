// Domínio puro do Acervo (spec 002, ADR-0005, ADR-0021, ADR-0025).
// Isbn e WorkTitle são objetos de valor: sem identidade, iguais pelo valor (`equals`), imutáveis e nascidos
// válidos pela fábrica `of`; o construtor é privado e o `brand` impede que o TypeScript troque um pelo outro.
import { newUuidV7, ProblemError } from "@biblioteca/core";

export interface WorkProps {
  readonly id: string;
  readonly title: WorkTitle;
  readonly authors: readonly string[];
  readonly subject: string;
  readonly isbn: Isbn | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** ISBN da obra: sem espaços nem hífens, com o dígito verificador do ISBN-10 ou do ISBN-13 conferido. */
export class Isbn {
  private readonly brand = "Isbn";

  private constructor(readonly value: string) {}

  static of(raw: string): Isbn {
    const cleaned = raw.replace(/[\s-]+/g, "").toUpperCase();
    if (cleaned.length === 10) {
      if (!isValidIsbn10(cleaned)) {
        throw new ProblemError("validation-error", {
          detail: "ISBN-10 inválido.",
          errors: [{ field: "isbn", message: "dígito verificador do ISBN-10 é inválido" }],
        });
      }
      return new Isbn(cleaned);
    }
    if (cleaned.length === 13) {
      if (!isValidIsbn13(cleaned)) {
        throw new ProblemError("validation-error", {
          detail: "ISBN-13 inválido.",
          errors: [{ field: "isbn", message: "dígito verificador do ISBN-13 é inválido" }],
        });
      }
      return new Isbn(cleaned);
    }
    throw new ProblemError("validation-error", {
      detail: "ISBN inválido.",
      errors: [{ field: "isbn", message: "ISBN deve ter 10 ou 13 dígitos" }],
    });
  }

  equals(other: Isbn): boolean {
    return other.value === this.value;
  }
}

/** Título da obra: sem espaços nas pontas, com 1 a 200 caracteres. */
export class WorkTitle {
  private readonly brand = "WorkTitle";

  private constructor(readonly value: string) {}

  static of(raw: string): WorkTitle {
    return new WorkTitle(normalizeText(raw, "title", 200, "título"));
  }

  equals(other: WorkTitle): boolean {
    return other.value === this.value;
  }
}

export function isValidIsbn10(cleaned: string): boolean {
  if (!/^\d{9}[\dX]$/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = cleaned[i]!;
    const digit = ch === "X" ? 10 : Number(ch);
    sum += (10 - i) * digit;
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(cleaned: string): boolean {
  if (!/^\d{13}$/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const weight = i % 2 === 0 ? 1 : 3;
    sum += Number(cleaned[i]!) * weight;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(cleaned[12]!);
}

function normalizeText(value: string, field: string, maxLen: number, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ProblemError("validation-error", {
      detail: `${label} inválido.`,
      errors: [{ field, message: `${label} não pode ficar vazio` }],
    });
  }
  if (trimmed.length > maxLen) {
    throw new ProblemError("validation-error", {
      detail: `${label} excede o limite.`,
      errors: [{ field, message: `${label} deve ter no máximo ${maxLen} caracteres` }],
    });
  }
  return trimmed;
}

function normalizeAuthors(authors: readonly string[]): string[] {
  if (authors.length === 0 || authors.length > 20) {
    throw new ProblemError("validation-error", {
      detail: "Lista de autores inválida.",
      errors: [{ field: "authors", message: "informe entre 1 e 20 autores" }],
    });
  }
  return authors.map((a, idx) => normalizeText(a, `authors.${idx}`, 120, "autor"));
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, idx) => item === b[idx]);
}

function sameIsbn(a: Isbn | null, b: Isbn | null): boolean {
  return a === null || b === null ? a === b : a.equals(b);
}

/** ISBN em branco vira "sem ISBN"; o resto passa pelo objeto de valor. */
function isbnOrNull(raw: string | null | undefined): Isbn | null {
  return raw === undefined || raw === null || raw.trim() === "" ? null : Isbn.of(raw);
}

export interface EditWorkInput {
  readonly title?: string;
  readonly authors?: readonly string[];
  readonly subject?: string;
  readonly isbn?: string | null;
}

export class Work {
  readonly props: WorkProps;

  private constructor(props: WorkProps) {
    this.props = props;
  }

  static reconstitute(props: WorkProps): Work {
    return new Work(props);
  }

  static create(
    input: {
      readonly title: string;
      readonly authors: readonly string[];
      readonly subject: string;
      readonly isbn?: string | null;
    },
    nowIso: string = new Date().toISOString(),
  ): Work {
    const title = WorkTitle.of(input.title);
    const authors = normalizeAuthors(input.authors);
    const subject = normalizeText(input.subject, "subject", 120, "assunto");
    const isbn = isbnOrNull(input.isbn);

    return new Work({
      id: newUuidV7(),
      title,
      authors,
      subject,
      isbn,
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  edit(
    patch: EditWorkInput,
    expectedVersion: number,
    nowIso: string = new Date().toISOString(),
  ): {
    readonly work: Work;
    readonly changed: boolean;
    readonly changes: Record<string, { readonly before: unknown; readonly after: unknown }>;
  } {
    if (this.props.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "Esta obra foi alterada por outra pessoa; recarregue para continuar.",
        currentVersion: this.props.version,
      });
    }

    const nextTitle = patch.title !== undefined ? WorkTitle.of(patch.title) : this.props.title;
    const nextAuthors = patch.authors !== undefined ? normalizeAuthors(patch.authors) : [...this.props.authors];
    const nextSubject =
      patch.subject !== undefined ? normalizeText(patch.subject, "subject", 120, "assunto") : this.props.subject;

    const nextIsbn = patch.isbn !== undefined ? isbnOrNull(patch.isbn) : this.props.isbn;

    // O registro de mudanças vai para a auditoria: leva o valor primitivo, não o objeto de valor
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    if (!nextTitle.equals(this.props.title)) {
      changes["title"] = { before: this.props.title.value, after: nextTitle.value };
    }
    if (!arraysEqual(nextAuthors, this.props.authors)) {
      changes["authors"] = { before: this.props.authors, after: nextAuthors };
    }
    if (nextSubject !== this.props.subject) changes["subject"] = { before: this.props.subject, after: nextSubject };
    if (!sameIsbn(nextIsbn, this.props.isbn)) {
      changes["isbn"] = { before: this.props.isbn?.value ?? null, after: nextIsbn?.value ?? null };
    }

    const changed = Object.keys(changes).length > 0;
    if (!changed) {
      return { work: this, changed: false, changes: {} };
    }

    return {
      changed: true,
      changes,
      work: new Work({
        ...this.props,
        title: nextTitle,
        authors: nextAuthors,
        subject: nextSubject,
        isbn: nextIsbn,
        version: this.props.version + 1,
        updatedAt: nowIso,
      }),
    };
  }
}
