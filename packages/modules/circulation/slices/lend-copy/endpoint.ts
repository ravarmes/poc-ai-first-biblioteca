import { LendCopyRequestSchema, type LoanDto } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createLendCopyHandler } from "./handler.ts";

export function registerLendCopyEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createLendCopyHandler(deps);
  app.post("/api/v1/circulation/loans", async (c) => {
    const body = parseInput(LendCopyRequestSchema, await readJsonBody(c));
    const loan: LoanDto = await mediator.send(handler, body, {
      principal: principalOf(c),
      requestId: c.get("requestId"),
    });
    return c.json(loan, 201, { Location: `/api/v1/circulation/loans/${loan.id}` });
  });
}
