import { SearchWorksQuerySchema, type WorkPageDto } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf } from "@biblioteca/core";
import { toWorkDto } from "../shared.ts";
import { createSearchWorksHandler } from "./handler.ts";

export function registerSearchWorksEndpoint(
  app: ApiRouter,
  mediator: Mediator,
  handler = createSearchWorksHandler(),
): void {
  app.get("/api/v1/catalog/works", async (c) => {
    const query = parseInput(SearchWorksQuerySchema, c.req.query());
    const rawPage = await mediator.send(handler, query, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    const page: WorkPageDto = {
      items: rawPage.items.map(toWorkDto),
      nextCursor: rawPage.nextCursor,
    };
    return c.json(page);
  });
}
