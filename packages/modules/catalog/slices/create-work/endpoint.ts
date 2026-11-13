import { CreateWorkRequestSchema, type WorkDto } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import { createCreateWorkHandler } from "./handler.ts";
import { toWorkDto } from "../shared.ts";

export function registerCreateWorkEndpoint(
  app: ApiRouter,
  mediator: Mediator,
  handler = createCreateWorkHandler(),
): void {
  app.post("/api/v1/catalog/works", async (c) => {
    const body = parseInput(CreateWorkRequestSchema, await readJsonBody(c));
    const saved = await mediator.send(handler, body, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    const created: WorkDto = toWorkDto(saved);
    return c.json(created, 201, {
      Location: `/api/v1/catalog/works/${created.id}`,
    });
  });
}
