import { type AuditEventPageDto, ListAuditEventsQuerySchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf } from "@biblioteca/core";
import { createListAuditEventsHandler } from "./handler.ts";

export function registerListAuditEventsEndpoint(
  app: ApiRouter,
  mediator: Mediator,
  handler = createListAuditEventsHandler(),
): void {
  app.get("/api/v1/audit-events", async (c) => {
    const query = parseInput(ListAuditEventsQuerySchema, c.req.query());
    const page: AuditEventPageDto = await mediator.send(handler, query, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    return c.json(page);
  });
}
