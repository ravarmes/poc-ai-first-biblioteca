import { ListNoticesQuerySchema, type NoticePageDto } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf } from "@biblioteca/core";
import { createListNoticesHandler } from "./handler.ts";

export function registerListNoticesEndpoint(
  app: ApiRouter,
  mediator: Mediator,
  handler = createListNoticesHandler(),
): void {
  app.get("/api/v1/notices", async (c) => {
    const query = parseInput(ListNoticesQuerySchema, c.req.query());
    const page: NoticePageDto = await mediator.send(handler, query, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    return c.json(page);
  });
}
