// Utilitários de teste para rodar fatias e mediador rapidamente em memória sem banco (ADR-0028).
import type { Principal, Role } from "@biblioteca/contract";
import type { Kysely } from "kysely";
import type { AuditEventInput } from "../audit/audit.ts";
import { Mediator } from "../mediator/mediator.ts";

export function aPrincipal(overrides: Partial<Principal> = {}): Principal {
  const role: Role = overrides.role ?? "librarian";
  return {
    userId: overrides.userId ?? "0193b2c0-0000-7000-8000-000000000010",
    role,
    displayName: overrides.displayName ?? (role === "librarian" ? "Ana Bibliotecária" : "Carlos Aluno"),
    email: overrides.email ?? (role === "librarian" ? "ana@bib.edu.br" : "carlos@alu.edu.br"),
    studentRegistration:
      overrides.studentRegistration !== undefined
        ? overrides.studentRegistration
        : role === "student"
          ? "2026-0001"
          : null,
  };
}

export class InMemoryAuditRecorder {
  readonly events: AuditEventInput[] = [];

  record = async (_trx: Kysely<unknown>, events: readonly AuditEventInput[]): Promise<void> => {
    this.events.push(...events);
  };
}

export function createInMemoryMediator(auditRecorder = new InMemoryAuditRecorder()): {
  mediator: Mediator;
  audit: InMemoryAuditRecorder;
} {
  const fakeTrx = {} as Kysely<unknown>;
  const mediator = new Mediator({
    runUnitOfWork: async (_scope, fn) => fn(fakeTrx),
    writeAudit: auditRecorder.record,
  });
  return { mediator, audit: auditRecorder };
}
