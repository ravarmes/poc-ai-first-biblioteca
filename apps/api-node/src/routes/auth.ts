// Rotas de autenticação local da Universidade: login, logout, perfil atual e contas dev (spec 001, ADR-0011).
import { LoginRequestSchema, type LoginResult } from "@biblioteca/contract";
import {
  type ApiRouter,
  CSRF_COOKIE_NAME,
  type DatabaseAuthenticator,
  parseInput,
  ProblemError,
  readJsonBody,
  requirePrincipal,
  SESSION_COOKIE_NAME,
  SESSION_TTL_HOURS,
} from "@biblioteca/core";
import { deleteCookie, setCookie } from "hono/cookie";

export interface RegisterAuthRoutesOptions {
  readonly enableDevAccounts: boolean;
}

export function registerAuthRoutes(
  app: ApiRouter,
  authenticator: DatabaseAuthenticator,
  options: RegisterAuthRoutesOptions,
): void {
  app.post("/api/v1/auth/login", async (c) => {
    const body = parseInput(LoginRequestSchema, await readJsonBody(c));
    const requestId = c.get("requestId");
    const session = await authenticator.loginByEmail(body.email, requestId);

    const maxAge = SESSION_TTL_HOURS * 3600;
    const isSecure = c.req.url.startsWith("https://");

    setCookie(c, SESSION_COOKIE_NAME, session.sessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: isSecure,
      maxAge,
    });
    setCookie(c, CSRF_COOKIE_NAME, session.csrfToken, {
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
      secure: isSecure,
      maxAge,
    });

    const result: LoginResult = {
      principal: session.principal,
      accessToken: session.sessionId,
    };
    c.header("Cache-Control", "no-store");
    return c.json(result);
  });

  app.get("/api/v1/auth/dev-accounts", async (c) => {
    if (!options.enableDevAccounts) {
      throw new ProblemError("not-found", { detail: "Contas de demonstração desabilitadas neste ambiente." });
    }
    const items = await authenticator.listDevAccounts();
    c.header("Cache-Control", "no-store");
    return c.json({ items });
  });

  app.post("/api/v1/auth/logout", async (c) => {
    const sessionId = c.get("sessionId");
    if (sessionId) {
      await authenticator.logout(sessionId, c.get("requestId"));
    }
    deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    deleteCookie(c, CSRF_COOKIE_NAME, { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/api/v1/auth/me", (c) => {
    const principal = requirePrincipal(c);
    c.header("Cache-Control", "no-store");
    return c.json(principal);
  });
}
