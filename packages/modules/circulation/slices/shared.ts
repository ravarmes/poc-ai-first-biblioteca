// Tipos compartilhados de injeção e mapeadores de DTO entre as fatias de Circulação (fora de domain/).
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
import { type ClockPort, SystemClock } from "../domain/value-objects.ts";
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
    ...copy,
    workTitle,
  };
}

export function toLoanDto(
  loan: LoanProps,
  meta: { readonly barcode: string; readonly workTitle: string; readonly studentRegistration: string },
): LoanDto {
  return {
    ...loan,
    barcode: meta.barcode,
    workTitle: meta.workTitle,
    studentRegistration: meta.studentRegistration,
  };
}

export function toFineDto(fine: FineProps): FineDto {
  return { ...fine };
}

export function toHoldDto(
  hold: HoldProps,
  meta: { readonly workTitle: string; readonly studentRegistration: string; readonly assignedBarcode: string | null },
): HoldDto {
  return {
    ...hold,
    workTitle: meta.workTitle,
    studentRegistration: meta.studentRegistration,
    assignedBarcode: meta.assignedBarcode,
  };
}

export function buildCopyReturnedEventV1(params: {
  readonly occurredAt: string;
  readonly copy: CopyProps;
  readonly workTitle: string;
  readonly promotedHold: HoldProps;
  readonly recipientStudent: {
    readonly id: string;
    readonly registration: string;
    readonly email: string;
  };
}): CopyReturnedEventV1 {
  return {
    eventId: newUuidV7(),
    schemaVersion: 1,
    occurredAt: params.occurredAt,
    copyId: params.copy.id,
    barcode: params.copy.barcode,
    workId: params.copy.workId,
    workTitle: params.workTitle,
    assignedHold: {
      holdId: params.promotedHold.id,
      studentId: params.recipientStudent.id,
      studentRegistration: params.recipientStudent.registration,
      recipientEmail: params.recipientStudent.email,
      expiresAt: params.promotedHold.expiresAt!,
    },
  };
}
