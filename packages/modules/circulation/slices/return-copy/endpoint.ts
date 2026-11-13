import { ReturnCopyRequestSchema, type ReturnCopyResultDto } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createReturnCopyHandler } from "./handler.ts";

export function registerReturnCopyEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createReturnCopyHandler(deps);
  app.post("/api/v1/circulation/returns", async (c) => {
    const body = parseInput(ReturnCopyRequestSchema, await readJsonBody(c));
    const result: ReturnCopyResultDto = await mediator.send(handler, body, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    return c.json(result);
  });
}
