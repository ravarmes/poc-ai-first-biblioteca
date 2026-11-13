import { UpdateWorkRequestSchema, type WorkDto, WorkIdParamsSchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import { createUpdateWorkHandler } from "./handler.ts";

export function registerUpdateWorkEndpoint(
  app: ApiRouter,
  mediator: Mediator,
  handler = createUpdateWorkHandler(),
): void {
  app.patch("/api/v1/catalog/works/:workId", async (c) => {
    const { workId } = parseInput(WorkIdParamsSchema, c.req.param());
    const body = parseInput(UpdateWorkRequestSchema, await readJsonBody(c));
    const saved = await mediator.send(
      handler,
      { workId, ...body },
      {
        principal: principalOf(c),
        requestId: c.get("requestId"),
      },
    );
    const updated: WorkDto = { ...saved, authors: [...saved.authors] };
    return c.json(updated);
  });
}
