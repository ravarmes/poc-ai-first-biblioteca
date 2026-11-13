import { type CopyReturnedEventV1, CopyReturnedEventV1Schema, type NoticeDispatchDto } from "@biblioteca/contract";
import { parseInput, type UseCase } from "@biblioteca/core";
import { buildHoldReadyNotice } from "../../domain/notice.ts";
import { type EmailSenderPort, NOTICES_SCOPE } from "../../domain/notice-ports.ts";
import { kyselyNoticeRepository, type NoticeRepositoryFactory } from "../../infrastructure/notice-adapters.ts";

export function createDispatchNoticeHandler(
  emailSender: EmailSenderPort,
  repositoryFor: NoticeRepositoryFactory = kyselyNoticeRepository,
): UseCase<CopyReturnedEventV1, NoticeDispatchDto | null> {
  return {
    name: "notices.dispatch-notice",
    scope: NOTICES_SCOPE,
    handle: async ({ input, trx, emit }) => {
      const event = parseInput(CopyReturnedEventV1Schema, input);
      const candidate = buildHoldReadyNotice(event);
      if (!candidate) return null;

      const { inserted, record } = await repositoryFor(trx).insertIfAbsent(candidate);
      if (!inserted) {
        return record;
      }

      await emailSender.send({
        to: record.recipientEmail,
        subject: record.subject,
        body: record.body,
        idempotencyKey: record.idempotencyKey,
      });

      emit({
        action: "notice.sent",
        resourceType: "notice",
        resourceId: record.id,
        changes: {
          holdId: record.holdId,
          idempotencyKey: record.idempotencyKey,
          recipientEmail: record.recipientEmail,
        },
      });

      return record;
    },
  };
}
