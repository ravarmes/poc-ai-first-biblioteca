// Composition Root da API Node (ADR-0009, ADR-0015, ADR-0016, ADR-0022).
import { resolve } from "node:path";
import {
  type ApiRouter,
  createApiRouter,
  createAuthAndCsrfMiddleware,
  createManagedDatabase,
  DatabaseAuthenticator,
  installErrorHandlers,
  type ManagedDatabase,
  Mediator,
  ProblemError,
  requestIdMiddleware,
} from "@biblioteca/core";
import { migrateDatabase } from "@biblioteca/core/migrator";
import { registerAuditModule } from "@biblioteca/module-audit/module";
import { registerCatalogModule } from "@biblioteca/module-catalog/module";
import { type CatalogFacade, CatalogHttpClient, createInProcessCatalogFacade } from "@biblioteca/module-catalog/public";
import { registerCirculationModule } from "@biblioteca/module-circulation/module";
import {
  type ClockPort,
  ConformistCalendarClient,
  generateAcademicDaysRange,
  InMemoryAcademicRegistry,
} from "@biblioteca/module-circulation/public";
import { registerConfigModule } from "@biblioteca/module-config/module";
import { createInProcessFineRateFacade } from "@biblioteca/module-config/public";
import { InMemoryEmailSender, registerNoticesModule } from "@biblioteca/module-notices/module";
import { createInProcessNoticesFacade } from "@biblioteca/module-notices/public";
import { cors } from "hono/cors";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerHealthRoutes } from "./routes/health.ts";
import { ensureDemoSeed } from "./seed.ts";

export const AVAILABLE_MODULES = ["catalog", "config", "notices", "audit", "circulation"] as const;
export type ModuleName = (typeof AVAILABLE_MODULES)[number];

export interface CreateLibraryAppOptions {
  readonly databaseUrl?: string;
  readonly managedDb?: ManagedDatabase;
  readonly modules?: string | readonly string[];
  readonly catalogAdapter?: "in-process" | "http";
  readonly catalogUrl?: string;
  readonly internalServiceToken?: string;
  readonly enableDevAccounts?: boolean;
  readonly seedDemoData?: boolean;
  readonly clock?: ClockPort;
  readonly academicRegistry?: InMemoryAcademicRegistry;
  readonly calendar?: ConformistCalendarClient;
  readonly fetchFn?: typeof fetch;
  readonly migrationsDir?: string;
}

export interface LibraryAppInstance {
  readonly app: ApiRouter;
  readonly managedDb: ManagedDatabase;
  readonly mediator: Mediator;
  readonly authenticator: DatabaseAuthenticator;
  readonly emailSender: InMemoryEmailSender;
  readonly academicRegistry: InMemoryAcademicRegistry;
  readonly calendar: ConformistCalendarClient;
  readonly activeModules: readonly ModuleName[];
  close(): Promise<void>;
}

export function resolveActiveModules(raw?: string | readonly string[]): ModuleName[] {
  if (!raw || raw === "*") return [...AVAILABLE_MODULES];
  const parts =
    typeof raw === "string"
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [...raw];
  if (parts.includes("*")) return [...AVAILABLE_MODULES];
  const valid = new Set<string>(AVAILABLE_MODULES);
  const selected: ModuleName[] = [];
  for (const part of parts) {
    if (!valid.has(part)) {
      throw new Error(`Módulo desconhecido em MODULES: '${part}'.`);
    }
    if (!selected.includes(part as ModuleName)) {
      selected.push(part as ModuleName);
    }
  }
  return selected;
}

export async function createLibraryApp(options: CreateLibraryAppOptions = {}): Promise<LibraryAppInstance> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? "pglite://memory";
  const ownsDb = !options.managedDb;
  const managedDb = options.managedDb ?? createManagedDatabase({ databaseUrl });
  const migrationsDir = options.migrationsDir ?? resolve(import.meta.dirname, "../../../contracts/db/migrations");

  await migrateDatabase(managedDb, migrationsDir);

  const activeModules = resolveActiveModules(options.modules ?? process.env.MODULES);
  const activeSet = new Set<ModuleName>(activeModules);

  const authenticator = new DatabaseAuthenticator(managedDb);
  await ensureDemoSeed(managedDb, authenticator, activeSet, options.seedDemoData ?? true);

  const mediator = new Mediator({ db: managedDb.db });
  const emailSender = new InMemoryEmailSender();
  const academicRegistry = options.academicRegistry ?? new InMemoryAcademicRegistry();
  const calendar = options.calendar ?? new ConformistCalendarClient({ dias_letivos: generateAcademicDaysRange() });
  const internalServiceToken = options.internalServiceToken ?? process.env.SERVICE_TOKEN;

  const app = createApiRouter();
  installErrorHandlers(app);
  app.use(
    "*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id", "Location"],
      credentials: true,
    }),
  );
  app.use("*", requestIdMiddleware());

  registerHealthRoutes(app, managedDb, activeModules);

  const authMiddleware = createAuthAndCsrfMiddleware(authenticator);
  app.use("/api/v1/*", async (c, next) => {
    if (
      (c.req.path === "/api/v1/auth/login" && c.req.method === "POST") ||
      (c.req.path === "/api/v1/auth/dev-accounts" && c.req.method === "GET")
    ) {
      return next();
    }
    return authMiddleware(c, next);
  });

  registerAuthRoutes(app, authenticator, {
    enableDevAccounts: options.enableDevAccounts ?? process.env.ENABLE_DEV_ACCOUNTS !== "false",
  });

  if (activeSet.has("catalog")) {
    registerCatalogModule(app, mediator, managedDb.db, { internalServiceToken });
  }
  if (activeSet.has("config")) {
    registerConfigModule(app, mediator);
  }
  if (activeSet.has("notices")) {
    registerNoticesModule(app, mediator);
  }
  if (activeSet.has("audit")) {
    registerAuditModule(app, mediator);
  }

  if (activeSet.has("circulation")) {
    const adapterMode = options.catalogAdapter ?? (process.env.CATALOG_ADAPTER as "in-process" | "http" | undefined) ?? "in-process";
    let catalogFacade: CatalogFacade;

    if (adapterMode === "http") {
      const catalogUrl = options.catalogUrl ?? process.env.CATALOG_URL;
      if (!catalogUrl || !internalServiceToken) {
        throw new ProblemError("internal-error", {
          detail: "Modo CATALOG_ADAPTER=http exige CATALOG_URL e internalServiceToken.",
        });
      }
      catalogFacade = new CatalogHttpClient({
        baseUrl: catalogUrl,
        serviceToken: internalServiceToken,
        fetchFn: options.fetchFn,
      });
    } else {
      if (!activeSet.has("catalog")) {
        throw new Error("Modo in-process exige o módulo 'catalog' ativo junto com 'circulation'.");
      }
      catalogFacade = createInProcessCatalogFacade(managedDb.db);
    }

    registerCirculationModule(app, mediator, {
      catalog: catalogFacade,
      config: createInProcessFineRateFacade(managedDb.db),
      notices: createInProcessNoticesFacade(mediator, emailSender),
      academicRegistry,
      calendar,
      clock: options.clock,
    });
  }

  return {
    app,
    managedDb,
    mediator,
    authenticator,
    emailSender,
    academicRegistry,
    calendar,
    activeModules,
    close: async () => {
      if (ownsDb) {
        await managedDb.close();
      }
    },
  };
}
