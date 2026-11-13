// Portas do módulo Circulação (Clean Architecture: interfaces puras em domain/, sem dependência de Kysely ou HTTP).
import type { CopyStatus } from "@biblioteca/contract";
import type { ModuleScope, PageResult } from "@biblioteca/core";
import type { SchoolCalendar } from "./calendar.ts";
import type { CopyProps } from "./copy.ts";
import type { FineProps } from "./fine.ts";
import type { HoldProps } from "./hold.ts";
import type { LoanProps } from "./loan.ts";
import type { AcademicStudent, Student, StudentProps } from "./student.ts";
import type { Barcode, StudentRegistration } from "./value-objects.ts";

export type { AcademicStudent, StudentProps };

export const CIRCULATION_SCOPE: ModuleScope = {
  role: "mod_circulation",
  searchPath: "circulation",
};

export interface ListCopiesFilter {
  readonly workId?: string;
  readonly status?: CopyStatus;
  readonly limit: number;
  readonly cursor?: string;
}

export interface CopyCountsByWork {
  readonly availableCopies: number;
  readonly onLoanCopies: number;
  readonly reservedCopies: number;
  readonly retiredCopies: number;
  readonly waitingHolds: number;
}

export interface CirculationRepository {
  // Students
  upsertStudentFromAcademic(academic: AcademicStudent, nowIso: string): Promise<StudentProps>;
  findStudentById(studentId: string): Promise<StudentProps | null>;
  findStudentByRegistration(registration: StudentRegistration): Promise<StudentProps | null>;
  /** O agregado Student inteiro: o aluno, os empréstimos em aberto e as multas pendentes; `null` se não existe. */
  loadStudent(studentId: string): Promise<Student | null>;
  /**
   * Grava o agregado Student inteiro: a versão sobe 1 só se ainda for `expectedVersion` (senão
   * `version-conflict`) e os empréstimos abertos pela raiz entram junto. É o único caminho para criar um
   * empréstimo: não há `insertLoan` na porta, e a regra dos 3 em aberto mora só no `Student.borrow`.
   */
  saveStudent(student: Student, expectedVersion: number): Promise<Student>;

  // Copies
  insertCopy(copy: CopyProps): Promise<CopyProps>;
  findCopyById(copyId: string): Promise<CopyProps | null>;
  findCopiesByIds(copyIds: readonly string[]): Promise<CopyProps[]>;
  findCopyByBarcode(barcode: Barcode): Promise<CopyProps | null>;
  updateCopyWithVersion(copy: CopyProps, expectedVersion: number): Promise<CopyProps>;
  listCopies(filter: ListCopiesFilter): Promise<PageResult<CopyProps>>;
  countByWork(workId: string): Promise<CopyCountsByWork>;

  // Loans
  findLoanById(loanId: string): Promise<LoanProps | null>;
  findOpenLoanByCopyId(copyId: string): Promise<LoanProps | null>;
  updateLoanWithVersion(loan: LoanProps, expectedVersion: number): Promise<LoanProps>;
  listOpenLoansByStudent(studentId: string): Promise<LoanProps[]>;

  // Fines
  insertFine(fine: FineProps): Promise<FineProps>;
  findFineById(fineId: string): Promise<FineProps | null>;
  updateFineWithVersion(fine: FineProps, expectedVersion: number): Promise<FineProps>;
  listFinesByStudent(studentId: string): Promise<FineProps[]>;

  // Holds
  insertHold(hold: HoldProps): Promise<HoldProps>;
  findHoldById(holdId: string): Promise<HoldProps | null>;
  updateHoldWithVersion(hold: HoldProps, expectedVersion: number): Promise<HoldProps>;
  hasActiveHold(studentId: string, workId: string): Promise<boolean>;
  hasWaitingHoldForWork(workId: string): Promise<boolean>;
  findNextWaitingHoldFifo(workId: string): Promise<HoldProps | null>;
  listActiveHoldsByStudent(studentId: string): Promise<HoldProps[]>;
  listHoldsByStudent(studentId: string): Promise<HoldProps[]>;
}

export interface AcademicRegistryPort {
  findByRegistration(registration: StudentRegistration): Promise<AcademicStudent | null>;
}

export interface SchoolCalendarPort {
  getCalendar(): Promise<SchoolCalendar>;
}
