// Domínio de Avisos por E-mail (ADR-0008, ADR-0024, spec 004).
import type { CopyReturnedEventV1, NoticeDispatchDto } from "@biblioteca/contract";
import { newUuidV7 } from "@biblioteca/core";

export function formatHoldIdempotencyKey(holdId: string): string {
  return `res-${holdId}`;
}

export function buildHoldReadyNotice(event: CopyReturnedEventV1, nowIso: string = new Date().toISOString()): NoticeDispatchDto | null {
  if (!event.assignedHold) return null;

  const hold = event.assignedHold;
  const idempotencyKey = formatHoldIdempotencyKey(hold.holdId);
  const subject = `Exemplar reservado disponível: ${event.workTitle}`;
  const body =
    `Olá, estudante (${hold.studentRegistration}). Um exemplar da obra "${event.workTitle}" ` +
    `(código ${event.barcode}) foi devolvido e está reservado para retirada no balcão até ${hold.expiresAt}.`;

  return {
    id: newUuidV7(),
    eventId: event.eventId,
    holdId: hold.holdId,
    workId: event.workId,
    workTitle: event.workTitle,
    studentId: hold.studentId,
    studentRegistration: hold.studentRegistration,
    recipientEmail: hold.recipientEmail,
    idempotencyKey,
    subject,
    body,
    status: "sent",
    createdAt: nowIso,
  };
}
