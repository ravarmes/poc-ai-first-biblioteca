import { type HoldDto, PlaceHoldRequestSchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createPlaceHoldHandler } from "./handler.ts";

export function registerPlaceHoldEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createPlaceHoldHandler(deps);
  app.post("/api/v1/circulation/holds", async (c) => {
    const body = parseInput(PlaceHoldRequestSchema, await readJsonBody(c));
    const hold: HoldDto = await mediator.send(handler, body, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    return c.json(hold, 201, { Location: `/api/v1/circulation/holds/${hold.id}` });
  });
}
