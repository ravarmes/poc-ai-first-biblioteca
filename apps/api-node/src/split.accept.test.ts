import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createLibraryApp, type LibraryAppInstance } from "./composition.ts";

describe("Modo separado (ADR-0015): Catalog em processo próprio atendendo Circulação via HTTP", () => {
  const SERVICE_TOKEN = "token-interno-de-teste";
  let catalogService: LibraryAppInstance;
  let circulationService: LibraryAppInstance;

  beforeAll(async () => {
    catalogService = await createLibraryApp({
      databaseUrl: "pglite://memory",
      modules: "catalog",
      internalServiceToken: SERVICE_TOKEN,
      seedDemoData: true,
    });

    circulationService = await createLibraryApp({
      databaseUrl: "pglite://memory",
      modules: "circulation,config,notices,audit",
      catalogAdapter: "http",
      catalogUrl: "http://catalog.internal",
      internalServiceToken: SERVICE_TOKEN,
      seedDemoData: true,
      fetchFn: async (input, init) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const parsed = new URL(rawUrl);
        return catalogService.app.request(`${parsed.pathname}${parsed.search}`, init);
      },
    });
  });

  afterAll(async () => {
    await circulationService.close();
    await catalogService.close();
  });

  test("[CS-002] [ADR-0015] rota interna rejeita acesso sem token e Circulação lê obras via HTTP", async () => {
    const anonInternal = await catalogService.app.request("/internal/v1/catalog/works/0193b2c0-0000-7100-8000-000000000001");
    expect(anonInternal.status).toBe(401);

    const loginRes = await circulationService.app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bibliotecaria@bib.edu.br" }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };

    // Circulação cadastra exemplar vinculando obra que existe apenas no processo do Catalog!
    const createCopy = await circulationService.app.request("/api/v1/circulation/copies", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        workId: "0193b2c0-0000-7100-8000-000000000001",
        barcode: "SPLIT-01",
      }),
    });
    expect(createCopy.status).toBe(201);
    const copyJson = (await createCopy.json()) as { workTitle: string };
    expect(copyJson.workTitle).toContain("Domain-Driven Design");

    // Consulta resumo de aluno após empréstimo enriquecendo título via /internal/v1/catalog/works/batch
    const lendRes = await circulationService.app.request("/api/v1/circulation/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ studentRegistration: "2026-0001", barcode: "SPLIT-01" }),
    });
    expect(lendRes.status).toBe(201);

    const summaryRes = await circulationService.app.request("/api/v1/circulation/students/2026-0001/summary", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(summaryRes.status).toBe(200);
    const summaryJson = (await summaryRes.json()) as { openLoans: Array<{ workTitle: string }> };
    expect(summaryJson.openLoans[0]?.workTitle).toContain("Domain-Driven Design");
  });

  test("[ADR-0015] responde 503 service-unavailable se o serviço de Catalog estiver fora do ar", async () => {
    const brokenCirculation = await createLibraryApp({
      databaseUrl: "pglite://memory",
      modules: "circulation,config,notices,audit",
      catalogAdapter: "http",
      catalogUrl: "http://catalog.down",
      internalServiceToken: SERVICE_TOKEN,
      seedDemoData: true,
      fetchFn: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    try {
      const loginRes = await brokenCirculation.app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "bibliotecaria@bib.edu.br" }),
      });
      const { accessToken } = (await loginRes.json()) as { accessToken: string };

      const res = await brokenCirculation.app.request("/api/v1/circulation/copies", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          workId: "0193b2c0-0000-7100-8000-000000000001",
          barcode: "DOWN-01",
        }),
      });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { type: string };
      expect(body.type).toBe("/problems/service-unavailable");
    } finally {
      await brokenCirculation.close();
    }
  });
});
