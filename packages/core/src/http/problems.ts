// Erros padronizados RFC 9457 (`application/problem+json`) e validação estrita com Zod (ADR-0014).
import type { FieldError, Problem, ProblemCode } from "@biblioteca/contract";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError, type ZodTypeAny } from "zod";

interface ProblemSpec {
  readonly status: ContentfulStatusCode;
  readonly title: string;
}

export const PROBLEM_CATALOG: Readonly<Record<ProblemCode, ProblemSpec>> = {
  "validation-error": { status: 400, title: "Erro de validação" },
  unauthenticated: { status: 401, title: "Não autenticado" },
  forbidden: { status: 403, title: "Acesso negado" },
  "csrf-invalid": { status: 403, title: "Token CSRF inválido ou ausente" },
  "not-found": { status: 404, title: "Recurso não encontrado" },
  "method-not-allowed": { status: 405, title: "Método não permitido" },
  "version-conflict": { status: 409, title: "Conflito de versão" },
  "isbn-taken": { status: 409, title: "ISBN já cadastrado" },
  "barcode-taken": { status: 409, title: "Código de barras já cadastrado" },
  "student-inactive": { status: 409, title: "Matrícula inativa na Secretaria" },
  "pending-fine": { status: 409, title: "Aluno possui multa pendente" },
  "loan-limit-reached": { status: 409, title: "Limite de empréstimos atingido" },
  "invalid-copy-state": { status: 409, title: "Estado do exemplar não permite a operação" },
  "no-active-loan": { status: 409, title: "Exemplar não possui empréstimo aberto" },
  "copy-available-use-loan": { status: 409, title: "Há exemplar disponível no acervo; faça empréstimo no balcão" },
  "hold-already-exists": { status: 409, title: "Aluno já possui reserva ativa para esta obra" },
  "hold-expired": { status: 409, title: "Prazo de retirada da reserva expirado" },
  "wrong-hold-student": { status: 409, title: "Exemplar reservado pertence a outro aluno da fila" },
  "active-hold-blocks-renewal": { status: 409, title: "Há reserva aguardando esta obra; devolva o exemplar" },
  "fine-already-paid": { status: 409, title: "Multa já está quitada" },
  "service-unavailable": { status: 503, title: "Serviço indisponível" },
  "internal-error": { status: 500, title: "Erro interno" },
};

export interface ProblemOptions {
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
  readonly currentVersion?: number;
  readonly checks?: { readonly database: "up" | "down" };
}

export class ProblemError extends Error {
  readonly code: ProblemCode;
  readonly status: ContentfulStatusCode;
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
  readonly currentVersion?: number;
  readonly checks?: { readonly database: "up" | "down" };

  constructor(code: ProblemCode, options: ProblemOptions = {}) {
    const spec = PROBLEM_CATALOG[code];
    super(options.detail ?? spec.title);
    this.name = "ProblemError";
    this.code = code;
    this.status = spec.status;
    this.detail = options.detail;
    this.errors = options.errors;
    this.currentVersion = options.currentVersion;
    this.checks = options.checks;
  }

  toProblem(instance?: string, requestId?: string): Problem {
    const spec = PROBLEM_CATALOG[this.code];
    return {
      type: `/problems/${this.code}`,
      title: spec.title,
      status: this.status,
      ...(this.detail !== undefined ? { detail: this.detail } : {}),
      ...(instance !== undefined ? { instance } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
      ...(this.errors !== undefined ? { errors: this.errors } : {}),
      ...(this.currentVersion !== undefined ? { currentVersion: this.currentVersion } : {}),
      ...(this.checks !== undefined ? { checks: this.checks } : {}),
    };
  }
}

export function problemResponse(c: Context, problem: ProblemError, extraHeaders?: Record<string, string>): Response {
  const requestId = c.get("requestId") as string | undefined;
  const payload = problem.toProblem(c.req.path, requestId);
  return c.json(payload, problem.status, {
    "Content-Type": "application/problem+json; charset=utf-8",
    ...(requestId ? { "X-Request-Id": requestId } : {}),
    ...extraHeaders,
  });
}

export function formatZodErrors(err: ZodError): FieldError[] {
  const fields: FieldError[] = [];
  for (const issue of err.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        fields.push({ field: key, message: `campo '${key}' não é permitido` });
      }
      continue;
    }
    const field = issue.path.length > 0 ? issue.path.map(String).join(".") : "body";
    fields.push({ field, message: issue.message });
  }
  return fields;
}

export function parseInput<S extends ZodTypeAny>(schema: S, value: unknown): ReturnType<S["parse"]> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const errors = formatZodErrors(result.error);
    throw new ProblemError("validation-error", {
      detail: "Um ou mais campos enviados são inválidos.",
      errors,
    });
  }
  return result.data as ReturnType<S["parse"]>;
}

export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ProblemError("validation-error", {
      detail: "O corpo da requisição precisa ser um JSON válido.",
      errors: [{ field: "body", message: "JSON inválido ou vazio" }],
    });
  }
}
