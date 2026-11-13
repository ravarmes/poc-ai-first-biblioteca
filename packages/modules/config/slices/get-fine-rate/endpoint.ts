import type { FineRateConfigDto } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, principalOf } from "@biblioteca/core";
import { createGetFineRateHandler } from "./handler.ts";

export function registerGetFineRateEndpoint(
  app: ApiRouter,
  mediator: Mediator,
  handler = createGetFineRateHandler(),
): void {
  app.get("/api/v1/config/fine-rate", async (c) => {
    const res: FineRateConfigDto = await mediator.send(handler, {}, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    return c.json(res);
  });
}
