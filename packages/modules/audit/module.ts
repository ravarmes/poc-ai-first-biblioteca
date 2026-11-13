import type { ApiRouter, Mediator } from "@biblioteca/core";
import { registerListAuditEventsEndpoint } from "./slices/list-audit-events/endpoint.ts";

export function registerAuditModule(app: ApiRouter, mediator: Mediator): void {
  registerListAuditEventsEndpoint(app, mediator);
}
