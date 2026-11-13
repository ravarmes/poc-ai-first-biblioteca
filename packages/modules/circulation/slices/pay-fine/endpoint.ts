import { type FineDto, FineIdParamsSchema, VersionInputSchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createPayFineHandler } from "./handler.ts";

export function registerPayFineEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createPayFineHandler(deps);
  app.post("/api/v1/circulation/fines/:fineId/pay", async (c) => {
    const { fineId } = parseInput(FineIdParamsSchema, { fineId: c.req.param("fineId") });
    const body = parseInput(VersionInputSchema, await readJsonBody(c));
    const fine: FineDto = await mediator.send(
      handler,
      { fineId, version: body.version },
      { principal: principalOf(c), requestId: c.get("requestId") },
    );
    return c.json(fine);
  });
}
