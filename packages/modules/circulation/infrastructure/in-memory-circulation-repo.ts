import { decodeCursor, type PageResult, ProblemError, toPage } from "@biblioteca/core";
import type { CopyProps } from "../domain/copy.ts";
import type { FineProps } from "../domain/fine.ts";
import type { HoldProps } from "../domain/hold.ts";
import type { LoanProps } from "../domain/loan.ts";
import type { CirculationRepository, CopyCountsByWork, ListCopiesFilter } from "../domain/ports.ts";
import { type AcademicStudent, Student, type StudentParts, type StudentProps } from "../domain/student.ts";

export class InMemoryCirculationRepository implements CirculationRepository {
  readonly students = new Map<string, StudentProps>();
  readonly copies = new Map<string, CopyProps>();
  readonly loans = new Map<string, LoanProps>();
  readonly fines = new Map<string, FineProps>();
  readonly holds = new Map<string, HoldProps>();

  async upsertStudentFromAcademic(academic: AcademicStudent, nowIso: string): Promise<StudentProps> {
    const existing = await this.findStudentByRegistration(academic.registration);
    if (!existing) {
      const created = Student.fromAcademic(academic, nowIso).props;
      this.students.set(created.id, created);
      return created;
    }
    const synced = Student.reconstitute(existing, this.#partsOf(existing.id)).syncWithAcademic(academic, nowIso).props;
    this.students.set(synced.id, synced);
    return synced;
  }

  async findStudentById(studentId: string): Promise<StudentProps | null> {
    return this.students.get(studentId) ?? null;
  }

  async findStudentByRegistration(registration: string): Promise<StudentProps | null> {
    for (const s of this.students.values()) {
      if (s.registration === registration) return s;
    }
    return null;
  }

  async loadStudent(studentId: string): Promise<Student | null> {
    const props = this.students.get(studentId);
    return props ? Student.reconstitute(props, this.#partsOf(studentId)) : null;
  }

  async saveStudent(student: Student, expectedVersion: number): Promise<Student> {
    const current = this.students.get(student.props.id);
    if (!current) {
      throw new ProblemError("not-found", { detail: "Aluno não encontrado." });
    }
    if (current.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "O aluno foi alterado por outra operação; recarregue os dados.",
        currentVersion: current.version,
      });
    }
    const newLoans = student.openLoans.map((loan) => loan.props).filter((loan) => !this.loans.has(loan.id));
    for (const loan of newLoans) {
      for (const existing of this.loans.values()) {
        if (existing.copyId === loan.copyId && existing.status === "open") {
          throw new ProblemError("invalid-copy-state", { detail: "Exemplar já possui empréstimo em aberto." });
        }
      }
    }
    this.students.set(student.props.id, student.props);
    for (const loan of newLoans) this.loans.set(loan.id, loan);
    return student;
  }

  /** Os empréstimos em aberto e as multas pendentes do aluno (as partes do agregado). */
  #partsOf(studentId: string): StudentParts {
    return {
      openLoans: [...this.loans.values()].filter((l) => l.studentId === studentId && l.status === "open"),
      pendingFines: [...this.fines.values()].filter((f) => f.studentId === studentId && f.status === "pending"),
    };
  }

  async insertCopy(copy: CopyProps): Promise<CopyProps> {
    for (const c of this.copies.values()) {
      if (c.barcode === copy.barcode) {
        throw new ProblemError("barcode-taken", { detail: `Código de barras '${copy.barcode}' já cadastrado.` });
      }
    }
    this.copies.set(copy.id, copy);
    return copy;
  }

  async findCopyById(copyId: string): Promise<CopyProps | null> {
    return this.copies.get(copyId) ?? null;
  }

  async findCopiesByIds(copyIds: readonly string[]): Promise<CopyProps[]> {
    const out: CopyProps[] = [];
    for (const id of new Set(copyIds)) {
      const c = this.copies.get(id);
      if (c) out.push(c);
    }
    return out;
  }

  async findCopyByBarcode(barcode: string): Promise<CopyProps | null> {
    for (const c of this.copies.values()) {
      if (c.barcode === barcode) return c;
    }
    return null;
  }

  async updateCopyWithVersion(copy: CopyProps, expectedVersion: number): Promise<CopyProps> {
    const current = this.copies.get(copy.id);
    if (!current) {
      throw new ProblemError("not-found", { detail: "Exemplar não encontrado." });
    }
    if (current.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "Exemplar modificado em paralelo; recarregue os dados.",
        currentVersion: current.version,
      });
    }
    this.copies.set(copy.id, copy);
    return copy;
  }

  async listCopies(filter: ListCopiesFilter): Promise<PageResult<CopyProps>> {
    const cursorId = filter.cursor ? decodeCursor(filter.cursor).id : undefined;
    const filtered = Array.from(this.copies.values())
      .filter((c) => {
        if (filter.workId && c.workId !== filter.workId) return false;
        if (filter.status && c.status !== filter.status) return false;
        if (cursorId && c.id >= cursorId) return false;
        return true;
      })
      .sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
    return toPage(filtered, filter.limit);
  }

  async countByWork(workId: string): Promise<CopyCountsByWork> {
    let availableCopies = 0;
    let onLoanCopies = 0;
    let reservedCopies = 0;
    let retiredCopies = 0;
    for (const c of this.copies.values()) {
      if (c.workId !== workId) continue;
      if (c.status === "available") availableCopies++;
      else if (c.status === "on-loan") onLoanCopies++;
      else if (c.status === "reserved") reservedCopies++;
      else if (c.status === "retired") retiredCopies++;
    }
    let waitingHolds = 0;
    for (const h of this.holds.values()) {
      if (h.workId === workId && h.status === "waiting") waitingHolds++;
    }
    return { availableCopies, onLoanCopies, reservedCopies, retiredCopies, waitingHolds };
  }

  async findLoanById(loanId: string): Promise<LoanProps | null> {
    return this.loans.get(loanId) ?? null;
  }

  async findOpenLoanByCopyId(copyId: string): Promise<LoanProps | null> {
    for (const loan of this.loans.values()) {
      if (loan.copyId === copyId && loan.status === "open") return loan;
    }
    return null;
  }

  async updateLoanWithVersion(loan: LoanProps, expectedVersion: number): Promise<LoanProps> {
    const current = this.loans.get(loan.id);
    if (!current) {
      throw new ProblemError("not-found", { detail: "Empréstimo não encontrado." });
    }
    if (current.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "Empréstimo alterado em paralelo; recarregue os dados.",
        currentVersion: current.version,
      });
    }
    this.loans.set(loan.id, loan);
    return loan;
  }

  async listOpenLoansByStudent(studentId: string): Promise<LoanProps[]> {
    return Array.from(this.loans.values())
      .filter((l) => l.studentId === studentId && l.status === "open")
      .sort((a, b) => (a.id > b.id ? -1 : 1));
  }

  async insertFine(fine: FineProps): Promise<FineProps> {
    this.fines.set(fine.id, fine);
    return fine;
  }

  async findFineById(fineId: string): Promise<FineProps | null> {
    return this.fines.get(fineId) ?? null;
  }

  async updateFineWithVersion(fine: FineProps, expectedVersion: number): Promise<FineProps> {
    const current = this.fines.get(fine.id);
    if (!current) {
      throw new ProblemError("not-found", { detail: "Multa não encontrada." });
    }
    if (current.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "Multa alterada em paralelo; recarregue os dados.",
        currentVersion: current.version,
      });
    }
    this.fines.set(fine.id, fine);
    return fine;
  }

  async listFinesByStudent(studentId: string): Promise<FineProps[]> {
    return Array.from(this.fines.values())
      .filter((f) => f.studentId === studentId)
      .sort((a, b) => (a.id > b.id ? -1 : 1));
  }

  async insertHold(hold: HoldProps): Promise<HoldProps> {
    for (const h of this.holds.values()) {
      if (
        h.studentId === hold.studentId &&
        h.workId === hold.workId &&
        (h.status === "waiting" || h.status === "ready")
      ) {
        throw new ProblemError("hold-already-exists", { detail: "Aluno já possui reserva ativa para esta obra." });
      }
    }
    this.holds.set(hold.id, hold);
    return hold;
  }

  async findHoldById(holdId: string): Promise<HoldProps | null> {
    return this.holds.get(holdId) ?? null;
  }

  async updateHoldWithVersion(hold: HoldProps, expectedVersion: number): Promise<HoldProps> {
    const current = this.holds.get(hold.id);
    if (!current) {
      throw new ProblemError("not-found", { detail: "Reserva não encontrada." });
    }
    if (current.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "Reserva alterada em paralelo; recarregue os dados.",
        currentVersion: current.version,
      });
    }
    this.holds.set(hold.id, hold);
    return hold;
  }

  async hasActiveHold(studentId: string, workId: string): Promise<boolean> {
    for (const h of this.holds.values()) {
      if (
        h.studentId === studentId &&
        h.workId === workId &&
        (h.status === "waiting" || h.status === "ready")
      ) {
        return true;
      }
    }
    return false;
  }

  async hasWaitingHoldForWork(workId: string): Promise<boolean> {
    for (const h of this.holds.values()) {
      if (h.workId === workId && h.status === "waiting") return true;
    }
    return false;
  }

  async findNextWaitingHoldFifo(workId: string): Promise<HoldProps | null> {
    const waiting = Array.from(this.holds.values())
      .filter((h) => h.workId === workId && h.status === "waiting")
      .sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    return waiting[0] ?? null;
  }

  async listActiveHoldsByStudent(studentId: string): Promise<HoldProps[]> {
    return Array.from(this.holds.values())
      .filter((h) => h.studentId === studentId && (h.status === "waiting" || h.status === "ready"))
      .sort((a, b) => (a.id > b.id ? -1 : 1));
  }

  async listHoldsByStudent(studentId: string): Promise<HoldProps[]> {
    return Array.from(this.holds.values())
      .filter((h) => h.studentId === studentId)
      .sort((a, b) => (a.id > b.id ? -1 : 1));
  }
}
