import { Hono } from "hono";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { decodeCursor, encodeCursor, toPage } from "./cursor.ts";
import { parseInput, PROBLEM_CATALOG, ProblemError, problemResponse, readJsonBody } from "./http/problems.ts";
import { newUuidV7 } from "./ids.ts";
import { Mediator, type UseCase } from "./mediator/mediator.ts";
import { aPrincipal, createInMemoryMediator } from "./testing/fakes.ts";

function aDummyDatabase() {
  return new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

describe("Núcleo (@biblioteca/core)", () => {
  test("gera UUIDv7 válido, codifica timestamp nos 48 bits e mantém monotonicidade no rollover de 4096 ids", () => {
    const tBase = Date.now() + 500_000;
    const first = newUuidV7(tBase);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const firstHex = first.replace(/-/g, "");
    expect(Number.parseInt(firstHex.slice(0, 12), 16)).toBe(tBase);
    expect(Number.parseInt(firstHex.slice(16, 18), 16) & 0xc0).toBe(0x80);

    // Relógio andando para trás não derruba o timestamp monotônico
    const earlier = newUuidV7(tBase - 100_000);
    expect(earlier > first).toBe(true);
    expect(Number.parseInt(earlier.replace(/-/g, "").slice(0, 12), 16)).toBeGreaterThanOrEqual(tBase);

    // Mais de 4096 IDs dentro do mesmo ms força incremento de +1 ms mantendo ordem estrita
    const burstTs = tBase + 50_000;
    const burst = Array.from({ length: 4105 }, () => newUuidV7(burstTs));
    for (let i = 1; i < burst.length; i++) {
      expect(burst[i]! > burst[i - 1]!).toBe(true);
    }
    const lastTs = Number.parseInt(burst.at(-1)!.replace(/-/g, "").slice(0, 12), 16);
    expect(lastTs).toBeGreaterThanOrEqual(burstTs + 1);
  });

  test("pagina por cursor opaco, normaliza UUID em maiúsculas e rejeita payloads inválidos", () => {
    const id = newUuidV7();
    const cursor = encodeCursor(id);
    expect(decodeCursor(cursor)).toEqual({ id });

    const upperCursor = Buffer.from(JSON.stringify({ id: id.toUpperCase() }), "utf8").toString("base64url");
    expect(decodeCursor(upperCursor)).toEqual({ id: id.toLowerCase() });

    const invalidCursors = [
      "nao-e-base64-valido",
      Buffer.from("null", "utf8").toString("base64url"),
      Buffer.from(JSON.stringify(["a"]), "utf8").toString("base64url"),
      Buffer.from(JSON.stringify({ id: 123 }), "utf8").toString("base64url"),
      Buffer.from(JSON.stringify({ id: "invalido" }), "utf8").toString("base64url"),
    ];
    for (const bad of invalidCursors) {
      expect(() => decodeCursor(bad)).toThrowError(ProblemError);
      try {
        decodeCursor(bad);
      } catch (err) {
        const p = err as ProblemError;
        expect(p.code).toBe("validation-error");
        expect(p.detail).toBe("O parâmetro de consulta contém um erro de validação.");
        expect(p.errors).toEqual([{ field: "cursor", message: "cursor de paginação inválido ou adulterado" }]);
      }
    }

    const page = toPage([{ id: "1" }, { id: "2" }, { id: "3" }], 2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();

    const lastPage = toPage([{ id: "1" }, { id: "2" }], 2);
    expect(lastPage.nextCursor).toBeNull();
  });

  test("PROBLEM_CATALOG, ProblemError, parseInput, readJsonBody e problemResponse seguem RFC 9457", async () => {
    expect(PROBLEM_CATALOG).toEqual({
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
    });

    // Sem opções extras: omite campos opcionais e usa o título no Error.message
    const minimal = new ProblemError("not-found");
    expect(minimal.name).toBe("ProblemError");
    expect(minimal.message).toBe("Recurso não encontrado");
    const minProblem = minimal.toProblem();
    expect(minProblem).toEqual({
      type: "/problems/not-found",
      title: "Recurso não encontrado",
      status: 404,
    });
    expect("detail" in minProblem).toBe(false);
    expect("instance" in minProblem).toBe(false);
    expect("requestId" in minProblem).toBe(false);
    expect("errors" in minProblem).toBe(false);
    expect("currentVersion" in minProblem).toBe(false);
    expect("checks" in minProblem).toBe(false);

    // Com todas as opções: inclui currentVersion e checks
    const full = new ProblemError("service-unavailable", {
      detail: "Banco offline",
      currentVersion: 4,
      checks: { database: "down" },
    });
    expect(full.message).toBe("Banco offline");
    expect(full.toProblem("/api/health", "req-h")).toEqual({
      type: "/problems/service-unavailable",
      title: "Serviço indisponível",
      status: 503,
      detail: "Banco offline",
      instance: "/api/health",
      requestId: "req-h",
      currentVersion: 4,
      checks: { database: "down" },
    });

    // parseInput com campo aninhado, chave desconhecida e erro na raiz ('body')
    const Schema = z
      .object({
        nested: z.object({ name: z.string().min(2, "nome curto") }),
      })
      .strict();
    expect(parseInput(Schema, { nested: { name: "Ok" } })).toEqual({ nested: { name: "Ok" } });

    try {
      parseInput(Schema, { nested: { name: "a" }, extra: 1 });
    } catch (err) {
      const problem = (err as ProblemError).toProblem("/api/test", "req-1");
      expect(problem.detail).toBe("Um ou mais campos enviados são inválidos.");
      expect(problem.errors).toEqual([
        { field: "nested.name", message: "nome curto" },
        { field: "extra", message: "campo 'extra' não é permitido" },
      ]);
    }

    try {
      parseInput(z.string().min(2, "texto curto"), "");
    } catch (err) {
      expect((err as ProblemError).errors).toEqual([{ field: "body", message: "texto curto" }]);
    }

    // readJsonBody + problemResponse sobre Hono real (com e sem requestId)
    const app = new Hono<{ Variables: { requestId?: string } }>();
    app.post("/with-req-id", async (c) => {
      c.set("requestId", "req-hono-1");
      const body = await readJsonBody(c);
      return c.json({ ok: true, body });
    });
    app.post("/no-req-id", async (c) => {
      const body = await readJsonBody(c);
      return c.json({ ok: true, body });
    });
    app.onError((err, c) => {
      if (err instanceof ProblemError) {
        return problemResponse(c, err, { "X-Extra": "sim" });
      }
      throw err;
    });

    const okRes = await app.request("/with-req-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: "DDD" }),
    });
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ ok: true, body: { titulo: "DDD" } });

    const badWithId = await app.request("/with-req-id", {
      method: "POST",
      body: "{json-quebrado",
    });
    expect(badWithId.status).toBe(400);
    expect(badWithId.headers.get("content-type")).toBe("application/problem+json; charset=utf-8");
    expect(badWithId.headers.get("x-request-id")).toBe("req-hono-1");
    expect(badWithId.headers.get("x-extra")).toBe("sim");
    expect(await badWithId.json()).toEqual({
      type: "/problems/validation-error",
      title: "Erro de validação",
      status: 400,
      detail: "O corpo da requisição precisa ser um JSON válido.",
      instance: "/with-req-id",
      requestId: "req-hono-1",
      errors: [{ field: "body", message: "JSON inválido ou vazio" }],
    });

    const badWithoutId = await app.request("/no-req-id", {
      method: "POST",
      body: "",
    });
    expect(badWithoutId.status).toBe(400);
    expect(badWithoutId.headers.get("x-request-id")).toBeNull();
    const badJsonNoId = (await badWithoutId.json()) as Record<string, unknown>;
    expect("requestId" in badJsonNoId).toBe(false);
  });

  test("Mediador executa escopo dinâmico, readOnly no prepare/handle, preservando eventos e sem gravar auditoria vazia", async () => {
    const order: string[] = [];
    const uowCalls: Array<{ scope: { role: string; searchPath: string }; readOnly?: boolean }> = [];
    const auditBatches: unknown[] = [];

    const mediator = new Mediator({
      runUnitOfWork: async (scope, fn, opts) => {
        uowCalls.push({ scope, readOnly: opts?.readOnly });
        return fn({} as never);
      },
      writeAudit: async (_trx, events) => {
        auditBatches.push([...events]);
      },
    });

    const ucRead: UseCase<{ val: number }, { total: number }, { extra: number }> = {
      name: "test.dynamic",
      scope: (input) => ({ role: "mod_catalog", searchPath: `catalog_${input.val}` }),
      readOnly: true,
      allowedRoles: ["librarian"],
      prepare: async ({ input, read }) => {
        order.push("prepare");
        const extra = await read({ role: "mod_config", searchPath: "config" }, async () => input.val * 2);
        return { extra };
      },
      handle: async ({ input, prepared, afterCommit }) => {
        order.push("handle");
        afterCommit(() => {
          order.push("afterCommit");
        });
        return { total: input.val + prepared.extra };
      },
    };

    const res = await mediator.send(ucRead, { val: 5 }, { principal: aPrincipal({ role: "librarian" }), requestId: "r-1" });
    expect(res).toEqual({ total: 15 });
    expect(order).toEqual(["prepare", "handle", "afterCommit"]);
    // Não emitiu nenhum evento -> writeAudit NÃO deve ser chamado
    expect(auditBatches).toHaveLength(0);
    expect(uowCalls).toEqual([
      { scope: { role: "mod_config", searchPath: "config" }, readOnly: true },
      { scope: { role: "mod_catalog", searchPath: "catalog_5" }, readOnly: true },
    ]);

    // Emissão com evento explícito vs padrão e principal ausente (anônimo)
    const ucEmit: UseCase<Record<string, never>, string> = {
      name: "test.emit",
      scope: { role: "mod_notices", searchPath: "notices" },
      handle: async ({ emit }) => {
        emit({ action: "e1", resourceType: "notice", resourceId: "1" });
        emit({
          action: "e2",
          resourceType: "notice",
          resourceId: "2",
          actorId: "custom-actor",
          actorRole: "system",
          requestId: "custom-req",
        });
        return "ok";
      },
    };
    await mediator.send(ucEmit, {}, { requestId: "req-global" });
    expect(auditBatches).toHaveLength(1);
    expect(auditBatches[0]).toEqual([
      {
        action: "e1",
        resourceType: "notice",
        resourceId: "1",
        actorId: null,
        actorRole: null,
        requestId: "req-global",
      },
      {
        action: "e2",
        resourceType: "notice",
        resourceId: "2",
        actorId: "custom-actor",
        actorRole: "system",
        requestId: "custom-req",
      },
    ]);
  });

  test("Mediador grava authz.denied (incluindo audit_reader -> mod_auth), pula afterCommit em erro e preserva erro original mesmo se compensate falhar", async () => {
    const denyScopes: Array<{ role: string; searchPath: string }> = [];
    const events: unknown[] = [];

    const mediator = new Mediator({
      runUnitOfWork: async (scope, fn) => {
        denyScopes.push(scope);
        return fn({} as never);
      },
      writeAudit: async (_trx, batch) => {
        events.push(...batch);
      },
    });

    // Audit_reader negado usa role mod_auth com searchPath audit
    const auditUc: UseCase<Record<string, never>, void> = {
      name: "audit.list",
      scope: { role: "audit_reader", searchPath: "audit" },
      authorize: async () => false,
      handle: async () => undefined,
    };

    const librarian = aPrincipal({ userId: "u-1", role: "librarian" });
    await expect(mediator.send(auditUc, {}, { principal: librarian, requestId: "req-deny" })).rejects.toMatchObject({
      code: "forbidden",
      detail: "Seu perfil não tem permissão para executar esta operação.",
    });
    expect(denyScopes).toEqual([{ role: "mod_auth", searchPath: "audit" }]);
    expect(events.at(-1)).toEqual({
      action: "authz.denied",
      resourceType: "usecase",
      resourceId: "audit.list",
      actorId: "u-1",
      actorRole: "librarian",
      result: "denied",
      reason: "forbidden",
      requestId: "req-deny",
    });

    // Compensate que também lança erro não mascara o erro original da UoW
    let compensated = false;
    let afterCommitRan = false;
    const { mediator: memMed } = createInMemoryMediator();
    const failBoth: UseCase<Record<string, never>, void, { token: string }> = {
      name: "test.fail-comp",
      scope: { role: "mod_circulation", searchPath: "circulation" },
      allowedRoles: ["librarian"],
      prepare: async () => ({ token: "ext-1" }),
      handle: async ({ afterCommit }) => {
        afterCommit(() => {
          afterCommitRan = true;
        });
        throw new Error("boom na tx");
      },
      compensate: async ({ prepared }) => {
        if (prepared.token === "ext-1") compensated = true;
        throw new Error("falha secundaria na compensacao");
      },
    };

    await expect(memMed.send(failBoth, {}, { principal: librarian })).rejects.toThrow("boom na tx");
    expect(compensated).toBe(true);
    expect(afterCommitRan).toBe(false);

    // Sem principal em caso protegido -> unauthenticated com detalhe claro
    await expect(memMed.send(failBoth, {})).rejects.toMatchObject({
      code: "unauthenticated",
      detail: "Esta operação exige um usuário autenticado.",
    });
  });

  test("Mediador aceita db direto (runInUnitOfWork), rejeita {} sem dependências e tolera erro de afterCommit mesmo sem callback", async () => {
    expect(() => new Mediator({})).toThrow("Mediator requer 'db' ou 'runUnitOfWork'");

    const db = aDummyDatabase();
    const dbMediator = new Mediator({ db });
    const ucDb: UseCase<Record<string, never>, string> = {
      name: "test.db-uow",
      scope: { role: "mod_catalog", searchPath: "catalog" },
      handle: async ({ afterCommit }) => {
        afterCommit(() => {
          throw new Error("erro silencioso sem callback");
        });
        return "via-db";
      },
    };
    expect(await dbMediator.send(ucDb, {})).toBe("via-db");

    let logged = "";
    const loggedMediator = new Mediator({
      runUnitOfWork: async (_s, fn) => fn({} as never),
      writeAudit: async () => undefined,
      onAfterCommitError: (name) => {
        logged = name;
      },
    });
    const ucErr: UseCase<Record<string, never>, string> = {
      name: "test.after-commit-err",
      scope: { role: "mod_notices", searchPath: "notices" },
      handle: async ({ afterCommit }) => {
        afterCommit(() => {
          throw new Error("falha de smtp");
        });
        return "ok";
      },
    };
    expect(await loggedMediator.send(ucErr, {})).toBe("ok");
    expect(logged).toBe("test.after-commit-err");
  });
});
