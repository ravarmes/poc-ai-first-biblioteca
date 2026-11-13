import { type CopyPageDto, ListCopiesQuerySchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createListCopiesHandler } from "./handler.ts";

export function registerListCopiesEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createListCopiesHandler(deps);
  app.get("/api/v1/circulation/copies", async (c) => {
    const query = parseInput(ListCopiesQuerySchema, c.req.query());
    const page: CopyPageDto = await mediator.send(handler, query, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    return c.json(page);
  });
}
