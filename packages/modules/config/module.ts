import type { ApiRouter, Mediator } from "@biblioteca/core";
import { registerGetFineRateEndpoint } from "./slices/get-fine-rate/endpoint.ts";
import { registerUpdateFineRateEndpoint } from "./slices/update-fine-rate/endpoint.ts";

export function registerConfigModule(app: ApiRouter, mediator: Mediator): void {
  registerGetFineRateEndpoint(app, mediator);
  registerUpdateFineRateEndpoint(app, mediator);
}
