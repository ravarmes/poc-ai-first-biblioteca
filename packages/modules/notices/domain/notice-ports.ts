import type { NoticeDispatchDto } from "@biblioteca/contract";
import type { ModuleScope, PageResult } from "@biblioteca/core";

export const NOTICES_SCOPE: ModuleScope = { role: "mod_notices", searchPath: "notices" };

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly idempotencyKey: string;
}

export interface EmailSenderPort {
  send(message: EmailMessage): Promise<void>;
}

export interface ListNoticesFilter {
  readonly studentRegistration?: string;
  readonly limit: number;
  readonly cursor?: string;
}

export interface NoticeRepository {
  insertIfAbsent(notice: NoticeDispatchDto): Promise<{ readonly inserted: boolean; readonly record: NoticeDispatchDto }>;
  list(filter: ListNoticesFilter): Promise<PageResult<NoticeDispatchDto>>;
}
