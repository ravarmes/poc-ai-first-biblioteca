import { StudentRegistrationParamsSchema, type StudentSummaryDto } from "@biblioteca/contract";
import { type ApiRouter, type Mediator, parseInput, principalOf } from "@biblioteca/core";
import type { CirculationDeps } from "../shared.ts";
import { createGetStudentSummaryHandler } from "./handler.ts";

export function registerGetStudentSummaryEndpoint(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  const handler = createGetStudentSummaryHandler(deps);
  app.get("/api/v1/circulation/students/:registration/summary", async (c) => {
    const { registration } = parseInput(StudentRegistrationParamsSchema, {
      registration: c.req.param("registration"),
    });
    const summary: StudentSummaryDto = await mediator.send(
      handler,
      { registration },
      { principal: principalOf(c), requestId: c.get("requestId") },
    );
    return c.json(summary);
  });
}
