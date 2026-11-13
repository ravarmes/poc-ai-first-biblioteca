import { type WorkAvailabilityDto, WorkIdParamsSchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createWorkAvailabilityHandler } from "./handler.ts";

export function registerWorkAvailabilityEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createWorkAvailabilityHandler(deps);
  app.get("/api/v1/circulation/works/:workId/availability", async (c) => {
    const { workId } = parseInput(WorkIdParamsSchema, { workId: c.req.param("workId") });
    const availability: WorkAvailabilityDto = await mediator.send(
      handler,
      { workId },
      { principal: principalOf(c), requestId: c.get("requestId") },
    );
    return c.json(availability);
  });
}
