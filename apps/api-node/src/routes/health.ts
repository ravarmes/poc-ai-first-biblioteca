// Sondas de vida e prontidão (spec 001 [1.1]).
import { type ApiRouter, type ManagedDatabase, ProblemError } from "@biblioteca/core";
import { sql } from "kysely";

export function registerHealthRoutes(
  app: ApiRouter,
  managed: ManagedDatabase,
  activeModules: readonly string[],
): void {
  app.get("/health/live", (c) => {
    return c.json({ status: "live", modules: [...activeModules] });
  });

  app.get("/health/ready", async (c) => {
    try {
      await sql`SELECT 1`.execute(managed.db);
      return c.json({
        status: "ready",
        checks: { database: "up" },
        modules: [...activeModules],
      });
    } catch {
      throw new ProblemError("service-unavailable", {
        detail: "Banco de dados indisponível no momento.",
        checks: { database: "down" },
      });
    }
  });
}
