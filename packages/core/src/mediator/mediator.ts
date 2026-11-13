// Mediador dos casos de uso: rastreamento -> autorização -> preparo -> unidade de trabalho -> auditoria -> handler -> pós-commit (ADR-0013).
import type { Principal, Role } from "@biblioteca/contract";
import type { Kysely } from "kysely";
import { type AuditEventInput, writeAuditEvents } from "../audit/audit.ts";
import type { AnyDatabase } from "../db/database.ts";
import { type ModuleScope, runInUnitOfWork } from "../db/unit-of-work.ts";
import { ProblemError } from "../http/problems.ts";

export type ScopedReader = <T>(scope: ModuleScope, fn: (trx: Kysely<unknown>) => Promise<T>) => Promise<T>;
export type AfterCommitAction = () => unknown;

export interface HandlerContext<I, P = undefined> {
  readonly input: I;
  readonly principal: Principal | undefined;
  readonly trx: Kysely<unknown>;
  readonly emit: (event: AuditEventInput) => void;
  readonly afterCommit: (action: AfterCommitAction) => void;
  readonly prepared: P;
}

export interface PrepareContext<I> {
  readonly input: I;
  readonly principal: Principal | undefined;
  readonly read: ScopedReader;
}

export interface CompensateContext<I, P> {
  readonly input: I;
  readonly principal: Principal | undefined;
  readonly prepared: P;
  readonly error: unknown;
  readonly read: ScopedReader;
}

export interface UseCase<I, O, P = undefined> {
  readonly name: string;
  readonly scope: ModuleScope | ((input: I) => ModuleScope);
  readonly readOnly?: boolean;
  /** Papéis aceitos diretamente ou predicado customizado de autorização (ex.: aluno só acessa própria matrícula). */
  readonly allowedRoles?: readonly Role[];
  readonly authorize?: (input: I, principal: Principal, read: ScopedReader) => boolean | Promise<boolean>;
  readonly prepare?: (ctx: PrepareContext<I>) => Promise<P>;
  readonly handle: (ctx: HandlerContext<I, P>) => Promise<O>;
  readonly compensate?: (ctx: CompensateContext<I, P>) => Promise<void>;
}

export interface SendOptions {
  readonly principal?: Principal;
  readonly requestId?: string;
}

export interface UnitOfWorkRunner {
  <T>(scope: ModuleScope, fn: (trx: Kysely<unknown>) => Promise<T>, options?: { readOnly?: boolean }): Promise<T>;
}

export interface MediatorDeps {
  readonly db?: AnyDatabase;
  readonly runUnitOfWork?: UnitOfWorkRunner;
  readonly writeAudit?: (trx: Kysely<unknown>, events: readonly AuditEventInput[]) => Promise<void>;
  readonly onAfterCommitError?: (useCaseName: string, error: unknown) => void;
}

export class Mediator {
  readonly #runUow: UnitOfWorkRunner;
  readonly #writeAudit: (trx: Kysely<unknown>, events: readonly AuditEventInput[]) => Promise<void>;
  readonly #onAfterCommitError?: (useCaseName: string, error: unknown) => void;

  constructor(deps: MediatorDeps) {
    if (deps.runUnitOfWork) {
      this.#runUow = deps.runUnitOfWork;
    } else if (deps.db) {
      const database = deps.db;
      this.#runUow = (scope, fn, opts) => runInUnitOfWork(database, scope, fn, opts);
    } else {
      throw new Error("Mediator requer 'db' ou 'runUnitOfWork'");
    }
    this.#writeAudit = deps.writeAudit ?? writeAuditEvents;
    this.#onAfterCommitError = deps.onAfterCommitError;
  }

  async send<I, O, P = undefined>(useCase: UseCase<I, O, P>, input: I, options: SendOptions = {}): Promise<O> {
    const scope = typeof useCase.scope === "function" ? useCase.scope(input) : useCase.scope;
    const principal = options.principal;
    const read: ScopedReader = (readScope, fn) => this.#runUow(readScope, fn, { readOnly: true });

    // 1. Autorização antes do preparo e antes da transação de escrita (ADR-0010, ADR-0013).
    if (useCase.allowedRoles || useCase.authorize) {
      if (!principal) {
        throw new ProblemError("unauthenticated", { detail: "Esta operação exige um usuário autenticado." });
      }
      const roleOk = !useCase.allowedRoles || useCase.allowedRoles.includes(principal.role);
      const customOk = roleOk && (!useCase.authorize || (await useCase.authorize(input, principal, read)));
      if (!customOk) {
        const denyScope = scope.role === "audit_reader" ? { role: "mod_auth", searchPath: "audit" } : scope;
        await this.#runUow(denyScope, (trx) =>
          this.#writeAudit(trx, [
            {
              action: "authz.denied",
              resourceType: "usecase",
              resourceId: useCase.name,
              actorId: principal.userId,
              actorRole: principal.role,
              result: "denied",
              reason: "forbidden",
              ...(options.requestId ? { requestId: options.requestId } : {}),
            },
          ]),
        );
        throw new ProblemError("forbidden", {
          detail: "Seu perfil não tem permissão para executar esta operação.",
        });
      }
    }

    // 2. Preparo fora da transação do módulo (evita duas conexões simultâneas / chamadas externas segurando lock).
    const prepared = useCase.prepare
      ? await useCase.prepare({ input, principal, read })
      : (undefined as unknown as P);

    // 3. Unidade de trabalho + auditoria atômica na mesma transação.
    const actions: AfterCommitAction[] = [];
    const afterCommit = (action: AfterCommitAction) => {
      actions.push(action);
    };

    let output: O;
    try {
      output = await this.#runUow(
        scope,
        async (trx) => {
          const events: AuditEventInput[] = [];
          const emit = (event: AuditEventInput) => {
            events.push({
              ...event,
              actorId: event.actorId ?? principal?.userId ?? null,
              actorRole: event.actorRole ?? principal?.role ?? null,
              ...(options.requestId && !event.requestId ? { requestId: options.requestId } : {}),
            });
          };

          const res = await useCase.handle({
            input,
            principal,
            trx,
            emit,
            afterCommit,
            prepared,
          });

          if (events.length > 0) {
            await this.#writeAudit(trx, events);
          }
          return res;
        },
        useCase.readOnly ? { readOnly: true } : undefined,
      );
    } catch (error) {
      if (useCase.compensate) {
        try {
          await useCase.compensate({ input, principal, prepared, error, read });
        } catch {
          // O erro original da unidade de trabalho sempre prevalece.
        }
      }
      throw error;
    }

    // 4. Pós-commit (eventos entre contextos, avisos por e-mail): falha aqui não desfaz o COMMIT.
    for (const action of actions) {
      try {
        await action();
      } catch (err) {
        this.#onAfterCommitError?.(useCase.name, err);
      }
    }

    return output;
  }
}
