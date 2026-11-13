// Fachada pública do módulo Avisos: porta de saída chamada pós-commit pela Circulação (ADR-0018, ADR-0024).
import type { CopyReturnedEventV1, NoticeDispatchDto } from "@biblioteca/contract";
import type { Mediator } from "@biblioteca/core";
import type { EmailMessage, EmailSenderPort } from "../domain/notice-ports.ts";
import { kyselyNoticeRepository, type NoticeRepositoryFactory } from "../infrastructure/notice-adapters.ts";
import { createDispatchNoticeHandler } from "../slices/dispatch-notice/handler.ts";

export type { EmailMessage, EmailSenderPort };

export interface NoticesFacade {
  handleCopyReturned(event: CopyReturnedEventV1): Promise<NoticeDispatchDto | null>;
}

export function createInProcessNoticesFacade(
  mediator: Mediator,
  emailSender: EmailSenderPort,
  repositoryFor: NoticeRepositoryFactory = kyselyNoticeRepository,
): NoticesFacade {
  const dispatchNotice = createDispatchNoticeHandler(emailSender, repositoryFor);
  return {
    handleCopyReturned: (event) => mediator.send(dispatchNotice, event),
  };
}
