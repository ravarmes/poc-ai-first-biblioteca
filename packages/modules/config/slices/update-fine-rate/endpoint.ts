import { type FineRateConfigDto, UpdateFineRateRequestSchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import { createUpdateFineRateHandler } from "./handler.ts";

export function registerUpdateFineRateEndpoint(
  app: ApiRouter,
  mediator: Mediator,
  handler = createUpdateFineRateHandler(),
): void {
  app.patch("/api/v1/config/fine-rate", async (c) => {
    const body = parseInput(UpdateFineRateRequestSchema, await readJsonBody(c));
    const updated: FineRateConfigDto = await mediator.send(handler, body, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    return c.json(updated);
  });
}
