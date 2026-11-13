// Caso de uso notices.list-notices (spec 004 [2.1], [2.2], ADR-0008).
import type { NoticeDispatchDto } from "@biblioteca/contract";
import type { PageResult, UseCase } from "@biblioteca/core";
import { NOTICES_SCOPE } from "../../domain/notice-ports.ts";
import { kyselyNoticeRepository, type NoticeRepositoryFactory } from "../../infrastructure/notice-adapters.ts";

export interface ListNoticesInput {
  readonly studentRegistration?: string;
  readonly limit: number;
  readonly cursor?: string;
}

export function createListNoticesHandler(
  repositoryFor: NoticeRepositoryFactory = kyselyNoticeRepository,
): UseCase<ListNoticesInput, PageResult<NoticeDispatchDto>> {
  return {
    name: "notices.list-notices",
    scope: NOTICES_SCOPE,
    readOnly: true,
    allowedRoles: ["librarian", "student"],
    authorize: (input, principal) => {
      if (principal.role === "librarian") return true;
      if (!principal.studentRegistration) return false;
      return !input.studentRegistration || input.studentRegistration === principal.studentRegistration;
    },
    handle: async ({ input, principal, trx }) => {
      const effectiveRegistration =
        principal?.role === "student" ? (principal.studentRegistration ?? undefined) : input.studentRegistration;

      return repositoryFor(trx).list({
        studentRegistration: effectiveRegistration,
        limit: input.limit,
        cursor: input.cursor,
      });
    },
  };
}
