// Paginação por cursor opaco em Base64URL (ADR-0020).
import { ProblemError } from "./http/problems.ts";

export interface PageResult<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export function encodeCursor(lastId: string): string {
  return Buffer.from(JSON.stringify({ id: lastId }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { readonly id: string } {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { id?: unknown };
    if (typeof parsed !== "object" || parsed === null || typeof parsed.id !== "string" || !/^[0-9a-f-]{36}$/i.test(parsed.id)) {
      throw new Error("formato de cursor inválido");
    }
    return { id: parsed.id.toLowerCase() };
  } catch {
    throw new ProblemError("validation-error", {
      detail: "O parâmetro de consulta contém um erro de validação.",
      errors: [{ field: "cursor", message: "cursor de paginação inválido ou adulterado" }],
    });
  }
}

export function toPage<T extends { readonly id: string }>(rows: readonly T[], limit: number): PageResult<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: last ? encodeCursor(last.id) : null,
  };
}
