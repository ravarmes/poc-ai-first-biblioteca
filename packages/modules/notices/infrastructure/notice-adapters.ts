import type { NoticeDispatchDto } from "@biblioteca/contract";
import { decodeCursor, type PageResult, toPage, typed } from "@biblioteca/core";
import { type Kysely, sql } from "kysely";
import type { EmailMessage, EmailSenderPort, ListNoticesFilter, NoticeRepository } from "../domain/notice-ports.ts";

export type NoticeRepositoryFactory = (trx: Kysely<unknown>) => NoticeRepository;

export class InMemoryEmailSender implements EmailSenderPort {
  readonly sentMessages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sentMessages.push(message);
  }
}

export class InMemoryNoticeRepository implements NoticeRepository {
  readonly byKey = new Map<string, NoticeDispatchDto>();

  async insertIfAbsent(
    notice: NoticeDispatchDto,
  ): Promise<{ readonly inserted: boolean; readonly record: NoticeDispatchDto }> {
    const existing = this.byKey.get(notice.idempotencyKey);
    if (existing) {
      return { inserted: false, record: { ...existing, status: "skipped" } };
    }
    this.byKey.set(notice.idempotencyKey, notice);
    return { inserted: true, record: notice };
  }

  async list(filter: ListNoticesFilter): Promise<PageResult<NoticeDispatchDto>> {
    const cursorId = filter.cursor ? decodeCursor(filter.cursor).id : undefined;
    const filtered = Array.from(this.byKey.values())
      .filter((n) => {
        if (filter.studentRegistration && n.studentRegistration !== filter.studentRegistration) return false;
        if (cursorId && n.id >= cursorId) return false;
        return true;
      })
      .sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));

    return toPage(filtered, filter.limit);
  }
}

interface NoticeRow {
  readonly id: string;
  readonly event_id: string;
  readonly hold_id: string;
  readonly work_id: string;
  readonly work_title: string;
  readonly student_id: string;
  readonly student_registration: string;
  readonly recipient_email: string;
  readonly idempotency_key: string;
  readonly subject: string;
  readonly body: string;
  readonly status: "sent" | "skipped";
  readonly created_at: Date | string;
}

interface NoticesDb {
  "notices.dispatches": NoticeRow;
}

function mapRow(row: NoticeRow): NoticeDispatchDto {
  return {
    id: row.id,
    eventId: row.event_id,
    holdId: row.hold_id,
    workId: row.work_id,
    workTitle: row.work_title,
    studentId: row.student_id,
    studentRegistration: row.student_registration,
    recipientEmail: row.recipient_email,
    idempotencyKey: row.idempotency_key,
    subject: row.subject,
    body: row.body,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  };
}

export class KyselyNoticeRepository implements NoticeRepository {
  readonly #trx: Kysely<NoticesDb>;

  constructor(trx: Kysely<unknown>) {
    this.#trx = typed<NoticesDb>(trx);
  }

  async insertIfAbsent(
    notice: NoticeDispatchDto,
  ): Promise<{ readonly inserted: boolean; readonly record: NoticeDispatchDto }> {
    const res = await sql<NoticeRow>`
      INSERT INTO notices.dispatches (
        id, event_id, hold_id, work_id, work_title, student_id, student_registration,
        recipient_email, idempotency_key, subject, body, status, created_at
      ) VALUES (
        ${notice.id}::uuid,
        ${notice.eventId}::uuid,
        ${notice.holdId}::uuid,
        ${notice.workId}::uuid,
        ${notice.workTitle},
        ${notice.studentId}::uuid,
        ${notice.studentRegistration},
        ${notice.recipientEmail},
        ${notice.idempotencyKey},
        ${notice.subject},
        ${notice.body},
        ${notice.status},
        ${notice.createdAt}::timestamptz
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, event_id, hold_id, work_id, work_title, student_id, student_registration,
                recipient_email, idempotency_key, subject, body, status, created_at
    `.execute(this.#trx);

    if (res.rows[0]) {
      return { inserted: true, record: mapRow(res.rows[0]) };
    }

    const existing = await sql<NoticeRow>`
      SELECT id, event_id, hold_id, work_id, work_title, student_id, student_registration,
             recipient_email, idempotency_key, subject, body, status, created_at
      FROM notices.dispatches
      WHERE idempotency_key = ${notice.idempotencyKey}
      LIMIT 1
    `.execute(this.#trx);

    const row = existing.rows[0]!;
    return {
      inserted: false,
      record: { ...mapRow(row), status: "skipped" },
    };
  }

  async list(filter: ListNoticesFilter): Promise<PageResult<NoticeDispatchDto>> {
    const cursorId = filter.cursor ? decodeCursor(filter.cursor).id : null;
    const conditions = [];
    if (filter.studentRegistration) {
      conditions.push(sql`student_registration = ${filter.studentRegistration}`);
    }
    if (cursorId) {
      conditions.push(sql`id < ${cursorId}::uuid`);
    }
    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
    const fetchLimit = filter.limit + 1;

    const res = await sql<NoticeRow>`
      SELECT id, event_id, hold_id, work_id, work_title, student_id, student_registration,
             recipient_email, idempotency_key, subject, body, status, created_at
      FROM notices.dispatches
      ${whereClause}
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `.execute(this.#trx);

    return toPage(res.rows.map(mapRow), filter.limit);
  }
}

export const kyselyNoticeRepository: NoticeRepositoryFactory = (trx) => new KyselyNoticeRepository(trx);
