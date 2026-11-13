// Cliente HTTP único com suporte a cookies HttpOnly + double-submit CSRF (`lib_csrf`) e erros RFC 9457 (ADR-0011, ADR-0014).
import type { Problem } from "@biblioteca/contract";

export class ApiProblemError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = "ApiProblemError";
    this.problem = problem;
  }

  get code(): string {
    return this.problem.type.replace(/^\/problems\//, "");
  }

  get isVersionConflict(): boolean {
    return this.problem.status === 409 && this.code === "version-conflict";
  }

  get isUnauthenticated(): boolean {
    return this.problem.status === 401;
  }
}

export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const raw of cookies) {
    const idx = raw.indexOf("=");
    if (idx < 0) continue;
    const name = raw.slice(0, idx).trim();
    if (name === "lib_csrf") {
      return decodeURIComponent(raw.slice(idx + 1).trim());
    }
  }
  return null;
}

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (MUTATION_METHODS.has(method)) {
    const csrf = readCsrfCookie();
    if (csrf && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrf);
    }
  }

  const response = await fetch(path, {
    ...init,
    method,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let problem: Problem;
    try {
      const parsed = (await response.json()) as Partial<Problem>;
      problem = {
        type: parsed.type ?? "/problems/internal-error",
        title: parsed.title ?? `Erro HTTP ${response.status}`,
        status: parsed.status ?? response.status,
        detail: parsed.detail,
        instance: parsed.instance,
        requestId: parsed.requestId ?? response.headers.get("X-Request-Id") ?? undefined,
        errors: parsed.errors,
        currentVersion: parsed.currentVersion,
        checks: parsed.checks,
      };
    } catch {
      problem = {
        type: "/problems/internal-error",
        title: `Erro HTTP ${response.status}`,
        status: response.status,
        detail: "Não foi possível interpretar a resposta de erro do servidor.",
      };
    }
    throw new ApiProblemError(problem);
  }

  return (await response.json()) as T;
}

export function buildQueryString(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      sp.set(k, String(v));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
