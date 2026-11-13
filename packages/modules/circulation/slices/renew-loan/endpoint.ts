import { type LoanDto, LoanIdParamsSchema, VersionInputSchema } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf, readJsonBody } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createRenewLoanHandler } from "./handler.ts";

export function registerRenewLoanEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createRenewLoanHandler(deps);
  app.post("/api/v1/circulation/loans/:loanId/renew", async (c) => {
    const { loanId } = parseInput(LoanIdParamsSchema, { loanId: c.req.param("loanId") });
    const body = parseInput(VersionInputSchema, await readJsonBody(c));
    const updated: LoanDto = await mediator.send(
      handler,
      { loanId, version: body.version },
      { principal: principalOf(c), requestId: c.get("requestId") },
    );
    return c.json(updated);
  });
}
