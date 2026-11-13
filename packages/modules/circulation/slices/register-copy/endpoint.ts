import { type CopyDto, RegisterCopyRequestSchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createRegisterCopyHandler } from "./handler.ts";

export function registerRegisterCopyEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createRegisterCopyHandler(deps);
  app.post("/api/v1/circulation/copies", async (c) => {
    const body = parseInput(RegisterCopyRequestSchema, await readJsonBody(c));
    const created: CopyDto = await mediator.send(handler, body, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    return c.json(created, 201, { Location: `/api/v1/circulation/copies/${created.id}` });
  });
}
