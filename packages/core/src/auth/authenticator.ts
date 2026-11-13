// Autenticação local da Universidade (ADR-0002, ADR-0010, ADR-0011): cookies HttpOnly + CSRF e Bearer para testes.
import { randomBytes } from "node:crypto";
import type { Principal, Role } from "@biblioteca/contract";
import { sql } from "kysely";
import { writeAuditEvents } from "../audit/audit.ts";
import type { ManagedDatabase } from "../db/database.ts";
import { type ModuleScope, runInUnitOfWork } from "../db/unit-of-work.ts";
import { ProblemError } from "../http/problems.ts";

export const AUTH_SCOPE: ModuleScope = { role: "mod_auth", searchPath: "auth" };
export const SESSION_COOKIE_NAME = "lib_sid";
export const CSRF_COOKIE_NAME = "lib_csrf";
export const SESSION_TTL_HOURS = 12;

export interface AccountSeedInput {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly studentRegistration: string | null;
  readonly active?: boolean;
}

export interface SessionCreationResult {
  readonly sessionId: string;
  readonly csrfToken: string;
  readonly principal: Principal;
}

interface AccountRow {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly role: Role;
  readonly student_registration: string | null;
  readonly active: boolean;
}

interface SessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly csrf_token: string;
  readonly role: Role;
  readonly display_name: string;
  readonly email: string;
  readonly student_registration: string | null;
  readonly expires_at: Date | string;
}

export class DatabaseAuthenticator {
  readonly #managed: ManagedDatabase;

  constructor(managed: ManagedDatabase) {
    this.#managed = managed;
  }

  async ensureAccounts(accounts: readonly AccountSeedInput[]): Promise<void> {
    await runInUnitOfWork(this.#managed.db, AUTH_SCOPE, async (trx) => {
      for (const acc of accounts) {
        await sql`
          INSERT INTO auth.accounts (id, email, display_name, role, student_registration, active)
          VALUES (
            ${acc.id}::uuid,
            ${acc.email.toLowerCase()},
            ${acc.displayName},
            ${acc.role},
            ${acc.studentRegistration},
            ${acc.active ?? true}
          )
          ON CONFLICT (email) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            role = EXCLUDED.role,
            student_registration = EXCLUDED.student_registration,
            active = EXCLUDED.active
        `.execute(trx);
      }
    });
  }

  async listDevAccounts(): Promise<Principal[]> {
    return runInUnitOfWork(
      this.#managed.db,
      AUTH_SCOPE,
      async (trx) => {
        const res = await sql<AccountRow>`
          SELECT id, email, display_name, role, student_registration, active
          FROM auth.accounts
          WHERE active = true
          ORDER BY role ASC, display_name ASC
        `.execute(trx);
        return res.rows.map((row) => ({
          userId: row.id,
          role: row.role,
          displayName: row.display_name,
          email: row.email,
          studentRegistration: row.student_registration,
        }));
      },
      { readOnly: true },
    );
  }

  async loginByEmail(emailInput: string, requestId?: string): Promise<SessionCreationResult> {
    const email = emailInput.trim().toLowerCase();
    return runInUnitOfWork(this.#managed.db, AUTH_SCOPE, async (trx) => {
      const accountRes = await sql<AccountRow>`
        SELECT id, email, display_name, role, student_registration, active
        FROM auth.accounts
        WHERE lower(email) = ${email}
        LIMIT 1
      `.execute(trx);

      const account = accountRes.rows[0];
      if (!account || !account.active) {
        await writeAuditEvents(trx, [
          {
            action: "auth.login",
            resourceType: "session",
            resourceId: null,
            actorId: account?.id ?? null,
            actorRole: account?.role ?? null,
            result: "denied",
            reason: account ? "account-inactive" : "account-not-found",
            changes: { email },
            ...(requestId ? { requestId } : {}),
          },
        ]);
        throw new ProblemError("unauthenticated", {
          detail: account ? "Conta institucional desativada." : "Conta não encontrada para o e-mail informado.",
        });
      }

      const sessionId = randomBytes(24).toString("base64url");
      const csrfToken = randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000).toISOString();

      await sql`
        INSERT INTO auth.sessions (id, user_id, csrf_token, role, display_name, email, student_registration, expires_at)
        VALUES (
          ${sessionId},
          ${account.id}::uuid,
          ${csrfToken},
          ${account.role},
          ${account.display_name},
          ${account.email},
          ${account.student_registration},
          ${expiresAt}::timestamptz
        )
      `.execute(trx);

      const principal: Principal = {
        userId: account.id,
        role: account.role,
        displayName: account.display_name,
        email: account.email,
        studentRegistration: account.student_registration,
      };

      await writeAuditEvents(trx, [
        {
          action: "auth.login",
          resourceType: "session",
          resourceId: account.id,
          actorId: account.id,
          actorRole: account.role,
          result: "success",
          ...(requestId ? { requestId } : {}),
        },
      ]);

      return { sessionId, csrfToken, principal };
    });
  }

  async resolveSession(sessionId: string): Promise<{ principal: Principal; csrfToken: string } | null> {
    if (!sessionId) return null;
    return runInUnitOfWork(
      this.#managed.db,
      AUTH_SCOPE,
      async (trx) => {
        const res = await sql<SessionRow>`
          SELECT s.id, s.user_id, s.csrf_token, s.role, s.display_name, s.email, s.student_registration, s.expires_at
          FROM auth.sessions s
          JOIN auth.accounts a ON a.id = s.user_id
          WHERE s.id = ${sessionId} AND a.active = true
          LIMIT 1
        `.execute(trx);

        const row = res.rows[0];
        if (!row) return null;
        if (new Date(row.expires_at).getTime() <= Date.now()) return null;

        return {
          csrfToken: row.csrf_token,
          principal: {
            userId: row.user_id,
            role: row.role,
            displayName: row.display_name,
            email: row.email,
            studentRegistration: row.student_registration,
          },
        };
      },
      { readOnly: true },
    );
  }

  async logout(sessionId: string, requestId?: string): Promise<void> {
    await runInUnitOfWork(this.#managed.db, AUTH_SCOPE, async (trx) => {
      const res = await sql<{ user_id: string; role: Role }>`
        DELETE FROM auth.sessions
        WHERE id = ${sessionId}
        RETURNING user_id, role
      `.execute(trx);
      const removed = res.rows[0];
      await writeAuditEvents(trx, [
        {
          action: "auth.logout",
          resourceType: "session",
          resourceId: removed?.user_id ?? null,
          actorId: removed?.user_id ?? null,
          actorRole: removed?.role ?? null,
          result: "success",
          ...(requestId ? { requestId } : {}),
        },
      ]);
    });
  }
}
