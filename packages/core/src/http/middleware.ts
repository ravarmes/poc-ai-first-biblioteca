// Middlewares HTTP da API em Hono (ADR-0011, ADR-0014): Request-Id, Auth + CSRF e tratamento RFC 9457.
import { timingSafeEqual } from "node:crypto";
import type { Principal } from "@biblioteca/contract";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import {
  CSRF_COOKIE_NAME,
  type DatabaseAuthenticator,
  SESSION_COOKIE_NAME,
} from "../auth/authenticator.ts";
import { newUuidV7 } from "../ids.ts";
import { ProblemError, problemResponse } from "./problems.ts";

export interface AppVariables {
  requestId: string;
  principal?: Principal;
  authMode?: "cookie" | "bearer";
  sessionId?: string;
}

export type ApiRouter = Hono<{ Variables: AppVariables }>;

const VALID_REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function createApiRouter(): ApiRouter {
  return new Hono<{ Variables: AppVariables }>();
}

export function requestIdMiddleware(): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const incoming = c.req.header("X-Request-Id");
    const requestId = incoming && VALID_REQUEST_ID_RE.test(incoming) ? incoming : newUuidV7();
    c.set("requestId", requestId);
    await next();
    c.header("X-Request-Id", requestId);
  };
}

export function principalOf(c: Context<{ Variables: AppVariables }>): Principal | undefined {
  return c.get("principal");
}

export function requirePrincipal(c: Context<{ Variables: AppVariables }>): Principal {
  const principal = c.get("principal");
  if (!principal) {
    throw new ProblemError("unauthenticated", { detail: "É necessário autenticar-se antes de acessar este recurso." });
  }
  return principal;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function createAuthAndCsrfMiddleware(
  authenticator: DatabaseAuthenticator,
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    let resolved: { principal: Principal; csrfToken: string; mode: "cookie" | "bearer"; sessionId: string } | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim();
      const found = await authenticator.resolveSession(token);
      if (found) {
        resolved = { ...found, mode: "bearer", sessionId: token };
      }
    } else {
      const sid = getCookie(c, SESSION_COOKIE_NAME);
      if (sid) {
        const found = await authenticator.resolveSession(sid);
        if (found) {
          resolved = { ...found, mode: "cookie", sessionId: sid };
        }
      }
    }

    if (!resolved) {
      throw new ProblemError("unauthenticated", { detail: "Sessão ausente, expirada ou token inválido." });
    }

    if (resolved.mode === "cookie" && MUTATION_METHODS.has(c.req.method.toUpperCase())) {
      const csrfCookie = getCookie(c, CSRF_COOKIE_NAME);
      const csrfHeader = c.req.header("X-CSRF-Token");
      if (!csrfCookie || !csrfHeader || !safeEqual(csrfCookie, csrfHeader) || !safeEqual(csrfHeader, resolved.csrfToken)) {
        throw new ProblemError("csrf-invalid", {
          detail: "Header X-CSRF-Token ausente ou diferente do cookie da sessão.",
        });
      }
    }

    c.set("principal", resolved.principal);
    c.set("authMode", resolved.mode);
    c.set("sessionId", resolved.sessionId);
    await next();
  };
}

export function createServiceAuthMiddleware(expectedToken: string): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ProblemError("unauthenticated", { detail: "Token de serviço ausente." });
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token || !safeEqual(token, expectedToken)) {
      throw new ProblemError("unauthenticated", { detail: "Token de serviço inválido." });
    }
    await next();
  };
}

export function installErrorHandlers(app: ApiRouter): void {
  app.notFound((c) => {
    const requestId = c.get("requestId") || newUuidV7();
    c.set("requestId", requestId);
    return problemResponse(c, new ProblemError("not-found", { detail: `Rota '${c.req.path}' não existe.` }));
  });

  app.onError((err, c) => {
    const requestId = c.get("requestId") || newUuidV7();
    c.set("requestId", requestId);
    if (err instanceof ProblemError) {
      return problemResponse(c, err);
    }
    return problemResponse(
      c,
      new ProblemError("internal-error", {
        detail: "Erro interno inesperado. Informe o requestId ao suporte se o problema persistir.",
      }),
    );
  });
}
