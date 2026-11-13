// Registro das rotas HTTP públicas do módulo Avisos.
import type { ApiRouter, Mediator } from "@biblioteca/core";
import { registerListNoticesEndpoint } from "./slices/list-notices/endpoint.ts";

export { InMemoryEmailSender } from "./infrastructure/notice-adapters.ts";
export type { EmailMessage, EmailSenderPort } from "./domain/notice-ports.ts";

export function registerNoticesModule(app: ApiRouter, mediator: Mediator): void {
  registerListNoticesEndpoint(app, mediator);
}
