import { HoldIdParamsSchema, VersionInputSchema, type WithdrawHoldResultDto } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createWithdrawReservedCopyHandler } from "./handler.ts";

export function registerWithdrawReservedCopyEndpoint(
  app: ApiRouter,
  mediator: Mediator,
  deps: CirculationDeps,
): void {
  const handler = createWithdrawReservedCopyHandler(deps);
  app.post("/api/v1/circulation/holds/:holdId/withdraw", async (c) => {
    const { holdId } = parseInput(HoldIdParamsSchema, { holdId: c.req.param("holdId") });
    const body = parseInput(VersionInputSchema, await readJsonBody(c));
    const result: WithdrawHoldResultDto = await mediator.send(
      handler,
      { holdId, version: body.version },
      { principal: principalOf(c), requestId: c.get("requestId") },
    );
    return c.json(result);
  });
}
