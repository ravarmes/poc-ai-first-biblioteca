import { type CopyDto, CopyIdParamsSchema, VersionInputSchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createRetireCopyHandler } from "./handler.ts";

export function registerRetireCopyEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createRetireCopyHandler(deps);
  app.post("/api/v1/circulation/copies/:copyId/retire", async (c) => {
    const { copyId } = parseInput(CopyIdParamsSchema, { copyId: c.req.param("copyId") });
    const body = parseInput(VersionInputSchema, await readJsonBody(c));
    const updated: CopyDto = await mediator.send(
      handler,
      { copyId, version: body.version },
      { principal: principalOf(c), requestId: c.get("requestId") },
    );
    return c.json(updated);
  });
}
