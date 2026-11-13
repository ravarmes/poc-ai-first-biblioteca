// Registro das rotas HTTP do módulo Circulação (spec 003).
import type { ApiRouter, Mediator } from "@biblioteca/core";
import { registerExpireHoldEndpoint } from "./slices/expire-hold/endpoint.ts";
import { registerGetStudentSummaryEndpoint } from "./slices/get-student-summary/endpoint.ts";
import { registerLendCopyEndpoint } from "./slices/lend-copy/endpoint.ts";
import { registerListCopiesEndpoint } from "./slices/list-copies/endpoint.ts";
import { registerPayFineEndpoint } from "./slices/pay-fine/endpoint.ts";
import { registerPlaceHoldEndpoint } from "./slices/place-hold/endpoint.ts";
import { registerRegisterCopyEndpoint } from "./slices/register-copy/endpoint.ts";
import { registerRenewLoanEndpoint } from "./slices/renew-loan/endpoint.ts";
import { registerRetireCopyEndpoint } from "./slices/retire-copy/endpoint.ts";
import { registerReturnCopyEndpoint } from "./slices/return-copy/endpoint.ts";
import type { CirculationDeps } from "./slices/shared.ts";
import { registerWithdrawReservedCopyEndpoint } from "./slices/withdraw-reserved-copy/endpoint.ts";
import { registerWorkAvailabilityEndpoint } from "./slices/work-availability/endpoint.ts";

export type { CirculationDeps } from "./slices/shared.ts";

export function registerCirculationModule(app: ApiRouter, mediator: Mediator, deps: CirculationDeps): void {
  registerListCopiesEndpoint(app, mediator, deps);
  registerRegisterCopyEndpoint(app, mediator, deps);
  registerRetireCopyEndpoint(app, mediator, deps);
  registerWorkAvailabilityEndpoint(app, mediator, deps);
  registerLendCopyEndpoint(app, mediator, deps);
  registerRenewLoanEndpoint(app, mediator, deps);
  registerReturnCopyEndpoint(app, mediator, deps);
  registerPlaceHoldEndpoint(app, mediator, deps);
  registerWithdrawReservedCopyEndpoint(app, mediator, deps);
  registerExpireHoldEndpoint(app, mediator, deps);
  registerPayFineEndpoint(app, mediator, deps);
  registerGetStudentSummaryEndpoint(app, mediator, deps);
}
