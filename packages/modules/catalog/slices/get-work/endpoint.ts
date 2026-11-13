import { type WorkDto, WorkIdParamsSchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf } from "@biblioteca/core";
import { createGetWorkHandler } from "./handler.ts";

export function registerGetWorkEndpoint(
  app: ApiRouter,
  mediator: Mediator,
  handler = createGetWorkHandler(),
): void {
  app.get("/api/v1/catalog/works/:workId", async (c) => {
    const { workId } = parseInput(WorkIdParamsSchema, c.req.param());
    const found = await mediator.send(
      handler,
      { workId },
      { principal: principalOf(c), requestId: c.get("requestId") },
    );
    const work: WorkDto = { ...found, authors: [...found.authors] };
    return c.json(work);
  });
}
