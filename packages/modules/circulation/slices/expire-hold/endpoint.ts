import { type ExpireHoldResultDto, HoldIdParamsSchema, VersionInputSchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createExpireHoldHandler } from "./handler.ts";

export function registerExpireHoldEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createExpireHoldHandler(deps);
  app.post("/api/v1/circulation/holds/:holdId/expire", async (c) => {
    const { holdId } = parseInput(HoldIdParamsSchema, { holdId: c.req.param("holdId") });
    const body = parseInput(VersionInputSchema, await readJsonBody(c));
    const result: ExpireHoldResultDto = await mediator.send(
      handler,
      { holdId, version: body.version },
      { principal: principalOf(c), requestId: c.get("requestId") },
    );
    return c.json(result);
  });
}
