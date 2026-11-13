import type {
  AuditEventDto,
  CopyDto,
  FineDto,
  FineRateConfigDto,
  HoldDto,
  LoanDto,
  NoticeDispatchDto,
  Principal,
  WorkDto,
} from "@biblioteca/contract";
import { HttpResponse, http } from "msw";

interface MockState {
  currentUser: Principal | null;
  works: WorkDto[];
  copies: CopyDto[];
  loans: LoanDto[];
  holds: HoldDto[];
  fines: FineDto[];
  notices: NoticeDispatchDto[];
  fineRate: FineRateConfigDto;
  auditEvents: AuditEventDto[];
  forceConflictOnNextFineRatePatch: boolean;
}

const ACCOUNTS: Principal[] = [
  {
    userId: "0193b2c0-0000-7000-8000-000000000001",
    role: "librarian",
    displayName: "Helena — Bibliotecária",
    email: "bibliotecaria@bib.edu.br",
    studentRegistration: null,
  },
  {
    userId: "0193b2c0-0000-7000-8000-000000000002",
    role: "student",
    displayName: "Ana Beatriz Silva (RA 2026-0001)",
    email: "ana@alu.edu.br",
    studentRegistration: "2026-0001",
  },
];

let idSeq = 100;
function nextId(): string {
  idSeq++;
  return `0193b2c0-0000-7500-8000-${String(idSeq).padStart(12, "0")}`;
}

export const mockState: MockState = {
  currentUser: null,
  works: [],
  copies: [],
  loans: [],
  holds: [],
  fines: [],
  notices: [],
  fineRate: {
    id: "default",
    dailyRateCents: 100,
    version: 1,
    updatedAt: "2026-11-10T10:00:00.000Z",
  },
  auditEvents: [],
  forceConflictOnNextFineRatePatch: false,
};

export function resetMockState(): void {
  idSeq = 100;
  mockState.currentUser = null;
  mockState.forceConflictOnNextFineRatePatch = false;
  mockState.works = [
    {
      id: "0193b2c0-0000-7100-8000-000000000001",
      title: "Domain-Driven Design",
      authors: ["Eric Evans"],
      subject: "Arquitetura de Software",
      isbn: "9780321125217",
      version: 1,
      createdAt: "2026-11-10T09:00:00.000Z",
      updatedAt: "2026-11-10T09:00:00.000Z",
    },
  ];
  mockState.copies = [
    {
      id: "0193b2c0-0000-7200-8000-000000000001",
      workId: "0193b2c0-0000-7100-8000-000000000001",
      workTitle: "Domain-Driven Design",
      barcode: "DDD-001",
      status: "available",
      version: 1,
      createdAt: "2026-11-10T09:00:00.000Z",
      updatedAt: "2026-11-10T09:00:00.000Z",
    },
  ];
  mockState.loans = [];
  mockState.holds = [];
  mockState.fines = [];
  mockState.notices = [];
  mockState.fineRate = {
    id: "default",
    dailyRateCents: 100,
    version: 1,
    updatedAt: "2026-11-10T10:00:00.000Z",
  };
  mockState.auditEvents = [
    {
      id: nextId(),
      occurredAt: "2026-11-10T09:05:00.000Z",
      requestId: "req-seed-1",
      actorId: ACCOUNTS[0]!.userId,
      actorRole: "librarian",
      action: "work.created",
      resourceType: "work",
      resourceId: "0193b2c0-0000-7100-8000-000000000001",
      result: "success",
      reason: null,
      changes: { title: "Domain-Driven Design" },
    },
  ];
}

resetMockState();

function problem(status: number, code: string, title: string, detail: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { type: `/problems/${code}`, title, status, detail, ...extra },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

export const handlers = [
  http.get("/api/v1/auth/dev-accounts", () => {
    return HttpResponse.json({ items: ACCOUNTS });
  }),

  http.get("/api/v1/auth/me", () => {
    if (!mockState.currentUser) {
      return problem(401, "unauthenticated", "Não autenticado", "Faça login para continuar.");
    }
    return HttpResponse.json(mockState.currentUser);
  }),

  http.post("/api/v1/auth/login", async ({ request }) => {
    const body = (await request.json()) as { email: string };
    const found = ACCOUNTS.find((a) => a.email.toLowerCase() === body.email.toLowerCase());
    if (!found) {
      return problem(401, "unauthenticated", "Não autenticado", "Conta não encontrada.");
    }
    mockState.currentUser = found;
    if (typeof document !== "undefined") {
      document.cookie = "lib_csrf=mock-csrf-token; path=/";
    }
    return HttpResponse.json({ principal: found, accessToken: `tok-${found.userId}` });
  }),

  http.post("/api/v1/auth/logout", () => {
    if (!mockState.currentUser) {
      return problem(401, "unauthenticated", "Não autenticado", "Sessão ausente ou expirada.");
    }
    mockState.currentUser = null;
    return HttpResponse.json({ ok: true });
  }),

  http.get("/api/v1/catalog/works", ({ request }) => {
    if (!mockState.currentUser) return problem(401, "unauthenticated", "Não autenticado", "Sessão ausente.");
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const items = mockState.works.filter(
      (w) =>
        !q ||
        w.title.toLowerCase().includes(q) ||
        w.authors.some((a) => a.toLowerCase().includes(q)) ||
        w.subject.toLowerCase().includes(q),
    );
    return HttpResponse.json({ items, nextCursor: null });
  }),

  http.post("/api/v1/catalog/works", async ({ request }) => {
    if (!mockState.currentUser) return problem(401, "unauthenticated", "Não autenticado", "Sessão ausente.");
    const body = (await request.json()) as { title: string; authors: string[]; subject: string; isbn?: string | null };
    const work: WorkDto = {
      id: nextId(),
      title: body.title,
      authors: body.authors,
      subject: body.subject,
      isbn: body.isbn ?? null,
      version: 1,
      createdAt: "2026-11-10T11:00:00.000Z",
      updatedAt: "2026-11-10T11:00:00.000Z",
    };
    mockState.works.unshift(work);
    return HttpResponse.json(work, { status: 201 });
  }),

  http.get("/api/v1/circulation/works/:workId/availability", ({ params }) => {
    const workId = String(params.workId);
    const copies = mockState.copies.filter((c) => c.workId === workId);
    const availableCopies = copies.filter((c) => c.status === "available").length;
    const onLoanCopies = copies.filter((c) => c.status === "on-loan").length;
    const reservedCopies = copies.filter((c) => c.status === "reserved").length;
    const retiredCopies = copies.filter((c) => c.status === "retired").length;
    const waitingHolds = mockState.holds.filter((h) => h.workId === workId && h.status === "waiting").length;
    return HttpResponse.json({
      workId,
      totalCopies: copies.length,
      availableCopies,
      onLoanCopies,
      reservedCopies,
      retiredCopies,
      waitingHolds,
      canPlaceHold: availableCopies === 0 && onLoanCopies + reservedCopies > 0,
    });
  }),

  http.get("/api/v1/circulation/copies", () => {
    return HttpResponse.json({ items: mockState.copies, nextCursor: null });
  }),

  http.post("/api/v1/circulation/copies", async ({ request }) => {
    const body = (await request.json()) as { workId: string; barcode: string };
    const work = mockState.works.find((w) => w.id === body.workId);
    if (!work) return problem(404, "not-found", "Obra não encontrada", "Obra inexistente.");
    const copy: CopyDto = {
      id: nextId(),
      workId: work.id,
      workTitle: work.title,
      barcode: body.barcode.trim().toUpperCase(),
      status: "available",
      version: 1,
      createdAt: "2026-11-10T11:00:00.000Z",
      updatedAt: "2026-11-10T11:00:00.000Z",
    };
    mockState.copies.unshift(copy);
    return HttpResponse.json(copy, { status: 201 });
  }),

  http.post("/api/v1/circulation/loans", async ({ request }) => {
    const body = (await request.json()) as { studentRegistration: string; barcode: string };
    const copy = mockState.copies.find((c) => c.barcode === body.barcode.trim().toUpperCase());
    if (!copy) return problem(404, "not-found", "Não encontrado", "Exemplar não encontrado.");
    if (copy.status !== "available") return problem(409, "invalid-copy-state", "Indisponível", "Exemplar não disponível.");
    copy.status = "on-loan";
    copy.version++;
    const loan: LoanDto = {
      id: nextId(),
      copyId: copy.id,
      barcode: copy.barcode,
      workId: copy.workId,
      workTitle: copy.workTitle,
      studentId: "0193b2c0-0000-7000-8000-000000000002",
      studentRegistration: body.studentRegistration,
      loanDate: "2026-11-10",
      dueDate: "2026-11-30",
      returnedAt: null,
      renewalsCount: 0,
      status: "open",
      version: 1,
    };
    mockState.loans.unshift(loan);
    return HttpResponse.json(loan, { status: 201 });
  }),

  http.post("/api/v1/circulation/returns", async ({ request }) => {
    const body = (await request.json()) as { barcode: string };
    const copy = mockState.copies.find((c) => c.barcode === body.barcode.trim().toUpperCase());
    if (!copy) return problem(404, "not-found", "Não encontrado", "Exemplar não encontrado.");
    const loan = mockState.loans.find((l) => l.copyId === copy.id && l.status === "open");
    if (!loan) return problem(409, "no-active-loan", "Sem empréstimo", "Exemplar não está emprestado.");

    loan.status = "returned";
    loan.returnedAt = "2026-12-03";
    loan.version++;
    copy.status = "available";
    copy.version++;

    const fine: FineDto = {
      id: nextId(),
      studentId: loan.studentId,
      loanId: loan.id,
      overdueDays: 3,
      dailyRateCents: mockState.fineRate.dailyRateCents,
      amountCents: 3 * mockState.fineRate.dailyRateCents,
      status: "pending",
      createdAt: "2026-12-03T14:00:00.000Z",
      paidAt: null,
      version: 1,
    };
    mockState.fines.unshift(fine);
    return HttpResponse.json({ loan, copy, fine, assignedHold: null });
  }),

  http.post("/api/v1/circulation/fines/:fineId/pay", ({ params }) => {
    const fine = mockState.fines.find((f) => f.id === String(params.fineId));
    if (!fine) return problem(404, "not-found", "Não encontrada", "Multa não encontrada.");
    fine.status = "paid";
    fine.paidAt = "2026-12-04T10:00:00.000Z";
    fine.version++;
    return HttpResponse.json(fine);
  }),

  http.get("/api/v1/circulation/students/:registration/summary", ({ params }) => {
    const reg = String(params.registration);
    return HttpResponse.json({
      id: "0193b2c0-0000-7000-8000-000000000002",
      registration: reg,
      name: "Ana Beatriz Silva",
      email: "ana@alu.edu.br",
      activeLoansCount: mockState.loans.filter((l) => l.studentRegistration === reg && l.status === "open").length,
      loanLimit: 3,
      openLoans: mockState.loans.filter((l) => l.studentRegistration === reg && l.status === "open"),
      holds: mockState.holds.filter((h) => h.studentRegistration === reg),
      fines: mockState.fines,
    });
  }),

  http.get("/api/v1/notices", ({ request }) => {
    const url = new URL(request.url);
    const reg = url.searchParams.get("studentRegistration");
    const items = reg ? mockState.notices.filter((n) => n.studentRegistration === reg) : mockState.notices;
    return HttpResponse.json({ items, nextCursor: null });
  }),

  http.get("/api/v1/config/fine-rate", () => {
    return HttpResponse.json(mockState.fineRate);
  }),

  http.patch("/api/v1/config/fine-rate", async ({ request }) => {
    const body = (await request.json()) as { dailyRateCents: number; version: number };
    if (mockState.forceConflictOnNextFineRatePatch || body.version !== mockState.fineRate.version) {
      mockState.forceConflictOnNextFineRatePatch = false;
      mockState.fineRate = {
        ...mockState.fineRate,
        dailyRateCents: 200,
        version: mockState.fineRate.version + 1,
      };
      return problem(409, "version-conflict", "Conflito de versão", "Outra bibliotecária alterou a multa agora há pouco.", {
        currentVersion: mockState.fineRate.version,
      });
    }
    const before = mockState.fineRate.dailyRateCents;
    mockState.fineRate = {
      id: "default",
      dailyRateCents: body.dailyRateCents,
      version: mockState.fineRate.version + 1,
      updatedAt: "2026-11-10T15:00:00.000Z",
    };
    mockState.auditEvents.unshift({
      id: nextId(),
      occurredAt: "2026-11-10T15:00:00.000Z",
      requestId: "req-patch-1",
      actorId: ACCOUNTS[0]!.userId,
      actorRole: "librarian",
      action: "fine_rate.updated",
      resourceType: "fine_rate",
      resourceId: "default",
      result: "success",
      reason: null,
      changes: { dailyRateCents: { before, after: body.dailyRateCents } },
    });
    return HttpResponse.json(mockState.fineRate);
  }),

  http.get("/api/v1/audit-events", ({ request }) => {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const items = action ? mockState.auditEvents.filter((e) => e.action === action) : mockState.auditEvents;
    return HttpResponse.json({ items, nextCursor: null });
  }),
];
