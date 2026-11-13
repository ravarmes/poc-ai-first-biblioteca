// Tipos compartilhados de injeção e mapeadores de DTO entre as fatias de Circulação (fora de domain/).
// Os mapeadores recebem os objetos de valor do domínio e entregam ao contrato o valor primitivo (texto e centavos).
import type { CopyDto, CopyReturnedEventV1, FineDto, HoldDto, LoanDto } from "@biblioteca/contract";
import { newUuidV7 } from "@biblioteca/core";
import type { CatalogFacade } from "@biblioteca/module-catalog/public";
import type { FineRateFacade } from "@biblioteca/module-config/public";
import type { NoticesFacade } from "@biblioteca/module-notices/public";
import type { CopyProps } from "../domain/copy.ts";
import type { FineProps } from "../domain/fine.ts";
import type { HoldProps } from "../domain/hold.ts";
import type { LoanProps } from "../domain/loan.ts";
import type { AcademicRegistryPort, SchoolCalendarPort } from "../domain/ports.ts";
import { type Barcode, type ClockPort, type Email, type StudentRegistration, SystemClock } from "../domain/value-objects.ts";
import { type CirculationRepositoryFactory, kyselyCirculationRepository } from "../infrastructure/kysely-circulation-repo.ts";

export interface CirculationDeps {
  readonly catalog: CatalogFacade;
  readonly config: FineRateFacade;
  readonly notices: NoticesFacade;
  readonly academicRegistry: AcademicRegistryPort;
  readonly calendar: SchoolCalendarPort;
  readonly clock?: ClockPort;
  readonly repositoryFor?: CirculationRepositoryFactory;
}

export function resolveClock(deps: CirculationDeps): ClockPort {
  return deps.clock ?? new SystemClock();
}

export function resolveRepoFactory(deps: CirculationDeps): CirculationRepositoryFactory {
  return deps.repositoryFor ?? kyselyCirculationRepository;
}

export function toCopyDto(copy: CopyProps, workTitle: string): CopyDto {
  return {
    id: copy.id,
    workId: copy.workId,
    workTitle,
    barcode: copy.barcode.value,
    status: copy.status,
    version: copy.version,
    createdAt: copy.createdAt,
    updatedAt: copy.updatedAt,
  };
}

export function toLoanDto(
  loan: LoanProps,
  meta: { readonly barcode: Barcode | null; readonly workTitle: string; readonly studentRegistration: StudentRegistration },
): LoanDto {
  return {
    ...loan,
    barcode: meta.barcode?.value ?? "N/D",
    workTitle: meta.workTitle,
    studentRegistration: meta.studentRegistration.value,
  };
}

export function toFineDto(fine: FineProps): FineDto {
  return {
    id: fine.id,
    studentId: fine.studentId,
    loanId: fine.loanId,
    overdueDays: fine.overdueDays,
    dailyRateCents: fine.dailyRate.cents,
    amountCents: fine.amount.cents,
    status: fine.status,
    createdAt: fine.createdAt,
    paidAt: fine.paidAt,
    version: fine.version,
  };
}

export function toHoldDto(
  hold: HoldProps,
  meta: {
    readonly workTitle: string;
    readonly studentRegistration: StudentRegistration;
    readonly assignedBarcode: Barcode | null;
  },
): HoldDto {
  return {
    ...hold,
    workTitle: meta.workTitle,
    studentRegistration: meta.studentRegistration.value,
    assignedBarcode: meta.assignedBarcode?.value ?? null,
  };
}

export function buildCopyReturnedEventV1(params: {
  readonly occurredAt: string;
  readonly copy: CopyProps;
  readonly workTitle: string;
  readonly promotedHold: HoldProps;
  readonly recipientStudent: {
    readonly id: string;
    readonly registration: StudentRegistration;
    readonly email: Email;
  };
}): CopyReturnedEventV1 {
  return {
    eventId: newUuidV7(),
    schemaVersion: 1,
    occurredAt: params.occurredAt,
    copyId: params.copy.id,
    barcode: params.copy.barcode.value,
    workId: params.copy.workId,
    workTitle: params.workTitle,
    assignedHold: {
      holdId: params.promotedHold.id,
      studentId: params.recipientStudent.id,
      studentRegistration: params.recipientStudent.registration.value,
      recipientEmail: params.recipientStudent.email.value,
      expiresAt: params.promotedHold.expiresAt!,
    },
  };
}
