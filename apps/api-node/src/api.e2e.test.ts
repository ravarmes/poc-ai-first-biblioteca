import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { FixedClock } from "@biblioteca/module-circulation/public";
import { createLibraryApp, type LibraryAppInstance } from "./composition.ts";

function extractCookieValue(setCookies: string[], name: string): string | null {
  for (const header of setCookies) {
    const match = header.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return match[1]!;
  }
  return null;
}

describe("API HTTP ponta a ponta (Specs 001 a 005)", () => {
  let instance: LibraryAppInstance;
  const clock = new FixedClock("2026-11-10T10:00:00.000Z");

  beforeAll(async () => {
    instance = await createLibraryApp({
      databaseUrl: "pglite://memory",
      clock,
      seedDemoData: true,
    });
  });

  afterAll(async () => {
    await instance.close();
  });

  test("[spec 001] health checks, contas dev, login com cookies + proteção CSRF e 401/403", async () => {
    const live = await instance.app.request("/health/live");
    expect(live.status).toBe(200);
    const liveBody = (await live.json()) as { modules: string[] };
    expect(liveBody.modules).toContain("circulation");

    const ready = await instance.app.request("/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.headers.get("x-request-id")).toBeTruthy();

    const devAccounts = await instance.app.request("/api/v1/auth/dev-accounts");
    expect(devAccounts.status).toBe(200);
    const accountsJson = (await devAccounts.json()) as { items: Array<{ email: string }> };
    expect(accountsJson.items.some((a) => a.email === "bibliotecaria@bib.edu.br")).toBe(true);

    const anonCatalog = await instance.app.request("/api/v1/catalog/works");
    expect(anonCatalog.status).toBe(401);
    expect(anonCatalog.headers.get("content-type")).toContain("application/problem+json");

    // Login por cookie e verificação de CSRF em mutação
    const loginRes = await instance.app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bibliotecaria@bib.edu.br" }),
    });
    expect(loginRes.status).toBe(200);
    const setCookies = loginRes.headers.getSetCookie();
    const sid = extractCookieValue(setCookies, "lib_sid");
    const csrf = extractCookieValue(setCookies, "lib_csrf");
    expect(sid).toBeTruthy();
    expect(csrf).toBeTruthy();

    // Mutação usando cookie SEM header X-CSRF-Token -> 403 csrf-invalid
    const missingCsrf = await instance.app.request("/api/v1/catalog/works", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `lib_sid=${sid}; lib_csrf=${csrf}`,
      },
      body: JSON.stringify({ title: "Teste CSRF", authors: ["Autor"], subject: "Teste" }),
    });
    expect(missingCsrf.status).toBe(403);
    const csrfProblem = (await missingCsrf.json()) as { type: string };
    expect(csrfProblem.type).toBe("/problems/csrf-invalid");

    // Mutação COM header X-CSRF-Token -> 201 Created
    const okCreate = await instance.app.request("/api/v1/catalog/works", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `lib_sid=${sid}; lib_csrf=${csrf}`,
        "X-CSRF-Token": csrf!,
      },
      body: JSON.stringify({ title: "Patterns of Enterprise Architecture", authors: ["Martin Fowler"], subject: "Arquitetura" }),
    });
    expect(okCreate.status).toBe(201);

    // Consulta /api/v1/auth/me, encerra sessão em /api/v1/auth/logout e confirma invalidação
    const meRes = await instance.app.request("/api/v1/auth/me", {
      headers: { Cookie: `lib_sid=${sid}; lib_csrf=${csrf}` },
    });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { email: string };
    expect(meBody.email).toBe("bibliotecaria@bib.edu.br");

    const logoutRes = await instance.app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        Cookie: `lib_sid=${sid}; lib_csrf=${csrf}`,
        "X-CSRF-Token": csrf!,
      },
    });
    expect(logoutRes.status).toBe(200);
    expect(await logoutRes.json()).toEqual({ ok: true });

    const meAfterLogout = await instance.app.request("/api/v1/auth/me", {
      headers: { Cookie: `lib_sid=${sid}; lib_csrf=${csrf}` },
    });
    expect(meAfterLogout.status).toBe(401);
  });

  test("[specs 002-005] jornada completa: cadastro -> empréstimo -> reserva -> devolução atrasada + aviso -> quitação -> auditoria", async () => {
    const loginAs = async (email: string): Promise<string> => {
      const res = await instance.app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as { accessToken: string };
      return json.accessToken;
    };

    const libToken = await loginAs("bibliotecaria@bib.edu.br");
    const anaToken = await loginAs("ana@alu.edu.br");
    const brunoToken = await loginAs("bruno@alu.edu.br");

    // 1. Cria obra e exemplar via HTTP
    const workRes = await instance.app.request("/api/v1/catalog/works", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${libToken}` },
      body: JSON.stringify({
        title: "Implementando Domain-Driven Design",
        authors: ["Vaughn Vernon"],
        subject: "Arquitetura",
        isbn: "9780321834577",
      }),
    });
    expect(workRes.status).toBe(201);
    const work = (await workRes.json()) as { id: string; version: number };

    const copyRes = await instance.app.request("/api/v1/circulation/copies", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${libToken}` },
      body: JSON.stringify({ workId: work.id, barcode: "IDDD-01" }),
    });
    expect(copyRes.status).toBe(201);

    // 2. Ana empresta o exemplar
    const lendRes = await instance.app.request("/api/v1/circulation/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${libToken}` },
      body: JSON.stringify({ studentRegistration: "2026-0001", barcode: "IDDD-01" }),
    });
    expect(lendRes.status).toBe(201);
    const loan = (await lendRes.json()) as { dueDate: string };

    // 3. Bruno reserva a obra enquanto emprestada
    const holdRes = await instance.app.request("/api/v1/circulation/holds", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brunoToken}` },
      body: JSON.stringify({ workId: work.id }),
    });
    expect(holdRes.status).toBe(201);

    // 4. Bibliotecária reajusta multa diária para R$ 2,00 (200 centavos) e verifica conflito 409
    const ratePatch = await instance.app.request("/api/v1/config/fine-rate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${libToken}` },
      body: JSON.stringify({ dailyRateCents: 200, version: 1 }),
    });
    expect(ratePatch.status).toBe(200);

    const stalePatch = await instance.app.request("/api/v1/config/fine-rate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${libToken}` },
      body: JSON.stringify({ dailyRateCents: 300, version: 1 }),
    });
    expect(stalePatch.status).toBe(409);

    // 5. Ana devolve 4 dias após o vencimento -> multa de 4 * 200 = 800 centavos + aviso enviado para Bruno
    clock.setNow(`${loan.dueDate}T14:00:00.000Z`);
    clock.advanceDays(4);

    const retRes = await instance.app.request("/api/v1/circulation/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${libToken}` },
      body: JSON.stringify({ barcode: "IDDD-01" }),
    });
    expect(retRes.status).toBe(200);
    const retJson = (await retRes.json()) as {
      fine: { id: string; amountCents: number; version: number } | null;
      assignedHold: { id: string; status: string } | null;
    };
    expect(retJson.fine?.amountCents).toBe(800);
    expect(retJson.assignedHold?.status).toBe("ready");

    // 6. Bruno vê seu aviso em GET /api/v1/notices, mas Ana não pode consultar avisos de Bruno
    const brunoNotices = await instance.app.request("/api/v1/notices", {
      headers: { Authorization: `Bearer ${brunoToken}` },
    });
    expect(brunoNotices.status).toBe(200);
    const brunoNoticesJson = (await brunoNotices.json()) as { items: Array<{ studentRegistration: string }> };
    expect(brunoNoticesJson.items.some((n) => n.studentRegistration === "2026-0002")).toBe(true);

    const anaDeniedNotices = await instance.app.request("/api/v1/notices?studentRegistration=2026-0002", {
      headers: { Authorization: `Bearer ${anaToken}` },
    });
    expect(anaDeniedNotices.status).toBe(403);

    // 7. Quita a multa de Ana e verifica trilha de auditoria acessível só à bibliotecária
    const payRes = await instance.app.request(`/api/v1/circulation/fines/${retJson.fine!.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${libToken}` },
      body: JSON.stringify({ version: retJson.fine!.version }),
    });
    expect(payRes.status).toBe(200);

    const studentAudit = await instance.app.request("/api/v1/audit-events", {
      headers: { Authorization: `Bearer ${anaToken}` },
    });
    expect(studentAudit.status).toBe(403);

    const libAudit = await instance.app.request("/api/v1/audit-events?limit=30", {
      headers: { Authorization: `Bearer ${libToken}` },
    });
    expect(libAudit.status).toBe(200);
    const auditJson = (await libAudit.json()) as { items: Array<{ action: string }> };
    const actions = new Set(auditJson.items.map((a) => a.action));
    expect(actions.has("work.created")).toBe(true);
    expect(actions.has("loan.created")).toBe(true);
    expect(actions.has("copy.returned")).toBe(true);
    expect(actions.has("notice.sent")).toBe(true);
    expect(actions.has("fine_rate.updated")).toBe(true);
    expect(actions.has("fine.paid")).toBe(true);
  });
});
