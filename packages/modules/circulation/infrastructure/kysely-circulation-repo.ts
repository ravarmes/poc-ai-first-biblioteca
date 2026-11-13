// Repositório PostgreSQL (schema circulation, role mod_circulation) via Kysely.
import type { CopyStatus, FineStatus, HoldStatus, LoanStatus } from "@biblioteca/contract";
import { decodeCursor, newUuidV7, type PageResult, ProblemError, toPage, typed } from "@biblioteca/core";
import { type Kysely, sql } from "kysely";
import type { CopyProps } from "../domain/copy.ts";
import type { FineProps } from "../domain/fine.ts";
import type { HoldProps } from "../domain/hold.ts";
import type { LoanProps } from "../domain/loan.ts";
import type { CirculationRepository, CopyCountsByWork, ListCopiesFilter } from "../domain/ports.ts";
import { type AcademicStudent, Student, type StudentProps } from "../domain/student.ts";
import { Barcode, Email, Money, StudentRegistration } from "../domain/value-objects.ts";

export type CirculationRepositoryFactory = (trx: Kysely<unknown>) => CirculationRepository;

interface StudentRow {
  readonly id: string;
  readonly registration: string;
  readonly name: string;
  readonly email: string;
  readonly version: number;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface CopyRow {
  readonly id: string;
  readonly work_id: string;
  readonly barcode: string;
  readonly status: CopyStatus;
  readonly version: number;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface LoanRow {
  readonly id: string;
  readonly copy_id: string;
  readonly student_id: string;
  readonly work_id: string;
  readonly loan_date: string;
  readonly due_date: string;
  readonly returned_at: string | null;
  readonly renewals_count: number;
  readonly status: LoanStatus;
  readonly version: number;
}

interface FineRow {
  readonly id: string;
  readonly student_id: string;
  readonly loan_id: string;
  readonly overdue_days: number;
  readonly daily_rate_cents: number;
  readonly amount_cents: number;
  readonly status: FineStatus;
  readonly created_at: Date | string;
  readonly paid_at: Date | string | null;
  readonly version: number;
}

interface HoldRow {
  readonly id: string;
  readonly work_id: string;
  readonly student_id: string;
  readonly assigned_copy_id: string | null;
  readonly status: HoldStatus;
  readonly created_at: Date | string;
  readonly expires_at: Date | string | null;
  readonly version: number;
}

interface CirculationDb {
  "circulation.students": StudentRow;
  "circulation.copies": CopyRow;
  "circulation.loans": LoanRow;
  "circulation.fines": FineRow;
  "circulation.holds": HoldRow;
}

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function mapStudent(row: StudentRow): StudentProps {
  return {
    id: row.id,
    registration: StudentRegistration.of(row.registration),
    name: row.name,
    email: Email.of(row.email),
    version: row.version,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapCopy(row: CopyRow): CopyProps {
  return {
    id: row.id,
    workId: row.work_id,
    barcode: Barcode.of(row.barcode),
    status: row.status,
    version: row.version,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapLoan(row: LoanRow): LoanProps {
  return {
    id: row.id,
    copyId: row.copy_id,
    studentId: row.student_id,
    workId: row.work_id,
    loanDate: row.loan_date,
    dueDate: row.due_date,
    returnedAt: row.returned_at,
    renewalsCount: row.renewals_count,
    status: row.status,
    version: row.version,
  };
}

function mapFine(row: FineRow): FineProps {
  return {
    id: row.id,
    studentId: row.student_id,
    loanId: row.loan_id,
    overdueDays: row.overdue_days,
    dailyRate: Money.ofCents(row.daily_rate_cents),
    amount: Money.ofCents(row.amount_cents),
    status: row.status,
    createdAt: toIso(row.created_at),
    paidAt: row.paid_at ? toIso(row.paid_at) : null,
    version: row.version,
  };
}

function mapHold(row: HoldRow): HoldProps {
  return {
    id: row.id,
    workId: row.work_id,
    studentId: row.student_id,
    assignedCopyId: row.assigned_copy_id,
    status: row.status,
    createdAt: toIso(row.created_at),
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
    version: row.version,
  };
}

function isPgUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

export class KyselyCirculationRepository implements CirculationRepository {
  readonly #trx: Kysely<CirculationDb>;

  constructor(trx: Kysely<unknown>) {
    this.#trx = typed<CirculationDb>(trx);
  }

  async upsertStudentFromAcademic(academic: AcademicStudent, nowIso: string): Promise<StudentProps> {
    const id = newUuidV7();
    const res = await sql<StudentRow>`
      INSERT INTO circulation.students (id, registration, name, email, version, created_at, updated_at)
      VALUES (
        ${id}::uuid,
        ${academic.registration.value},
        ${academic.name},
        ${academic.email.value},
        1,
        ${nowIso}::timestamptz,
        ${nowIso}::timestamptz
      )
      ON CONFLICT (registration) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        version = CASE
          WHEN circulation.students.name <> EXCLUDED.name OR circulation.students.email <> EXCLUDED.email
            THEN circulation.students.version + 1
          ELSE circulation.students.version
        END,
        updated_at = CASE
          WHEN circulation.students.name <> EXCLUDED.name OR circulation.students.email <> EXCLUDED.email
            THEN EXCLUDED.updated_at
          ELSE circulation.students.updated_at
        END
      RETURNING id, registration, name, email, version, created_at, updated_at
    `.execute(this.#trx);
    return mapStudent(res.rows[0]!);
  }

  async findStudentById(studentId: string): Promise<StudentProps | null> {
    const res = await sql<StudentRow>`
      SELECT id, registration, name, email, version, created_at, updated_at
      FROM circulation.students
      WHERE id = ${studentId}::uuid
      LIMIT 1
    `.execute(this.#trx);
    return res.rows[0] ? mapStudent(res.rows[0]) : null;
  }

  async findStudentByRegistration(registration: StudentRegistration): Promise<StudentProps | null> {
    const res = await sql<StudentRow>`
      SELECT id, registration, name, email, version, created_at, updated_at
      FROM circulation.students
      WHERE registration = ${registration.value}
      LIMIT 1
    `.execute(this.#trx);
    return res.rows[0] ? mapStudent(res.rows[0]) : null;
  }

  async loadStudent(studentId: string): Promise<Student | null> {
    const props = await this.findStudentById(studentId);
    if (!props) return null;
    const [openLoans, pendingFines] = await Promise.all([
      this.listOpenLoansByStudent(studentId),
      this.#listPendingFinesByStudent(studentId),
    ]);
    return Student.reconstitute(props, { openLoans, pendingFines });
  }

  async saveStudent(student: Student, expectedVersion: number): Promise<Student> {
    const props = student.props;
    const res = await sql<{ id: string }>`
      UPDATE circulation.students
      SET name = ${props.name}, email = ${props.email.value}, version = ${props.version},
        updated_at = ${props.updatedAt}::timestamptz
      WHERE id = ${props.id}::uuid AND version = ${expectedVersion}
      RETURNING id
    `.execute(this.#trx);
    if (!res.rows[0]) {
      const current = await this.findStudentById(props.id);
      if (!current) throw new ProblemError("not-found", { detail: "Aluno não encontrado." });
      throw new ProblemError("version-conflict", {
        detail: "O aluno foi alterado por outra operação; recarregue os dados.",
        currentVersion: current.version,
      });
    }
    // Os empréstimos em aberto do agregado: os que já estavam no banco ficam como estão; o aberto pela raiz entra.
    for (const loan of student.openLoans) {
      await this.#insertLoanIfAbsent(loan.props);
    }
    return student;
  }

  async insertCopy(copy: CopyProps): Promise<CopyProps> {
    try {
      const res = await sql<CopyRow>`
        INSERT INTO circulation.copies (id, work_id, barcode, status, version, created_at, updated_at)
        VALUES (
          ${copy.id}::uuid,
          ${copy.workId}::uuid,
          ${copy.barcode.value},
          ${copy.status},
          ${copy.version},
          ${copy.createdAt}::timestamptz,
          ${copy.updatedAt}::timestamptz
        )
        RETURNING id, work_id, barcode, status, version, created_at, updated_at
      `.execute(this.#trx);
      return mapCopy(res.rows[0]!);
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new ProblemError("barcode-taken", { detail: `Código de barras '${copy.barcode.value}' já cadastrado.` });
      }
      throw error;
    }
  }

  async findCopyById(copyId: string): Promise<CopyProps | null> {
    const res = await sql<CopyRow>`
      SELECT id, work_id, barcode, status, version, created_at, updated_at
      FROM circulation.copies
      WHERE id = ${copyId}::uuid
      LIMIT 1
    `.execute(this.#trx);
    return res.rows[0] ? mapCopy(res.rows[0]) : null;
  }

  async findCopiesByIds(copyIds: readonly string[]): Promise<CopyProps[]> {
    const valid = [...new Set(copyIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (valid.length === 0) return [];
    const params = sql.join(valid.map((id) => sql`${id}::uuid`));
    const res = await sql<CopyRow>`
      SELECT id, work_id, barcode, status, version, created_at, updated_at
      FROM circulation.copies
      WHERE id IN (${params})
    `.execute(this.#trx);
    return res.rows.map(mapCopy);
  }

  async findCopyByBarcode(barcode: Barcode): Promise<CopyProps | null> {
    const res = await sql<CopyRow>`
      SELECT id, work_id, barcode, status, version, created_at, updated_at
      FROM circulation.copies
      WHERE barcode = ${barcode.value}
      LIMIT 1
    `.execute(this.#trx);
    return res.rows[0] ? mapCopy(res.rows[0]) : null;
  }

  async updateCopyWithVersion(copy: CopyProps, expectedVersion: number): Promise<CopyProps> {
    const res = await sql<CopyRow>`
      UPDATE circulation.copies
      SET status = ${copy.status}, version = version + 1, updated_at = ${copy.updatedAt}::timestamptz
      WHERE id = ${copy.id}::uuid AND version = ${expectedVersion}
      RETURNING id, work_id, barcode, status, version, created_at, updated_at
    `.execute(this.#trx);
    if (res.rows[0]) return mapCopy(res.rows[0]);

    const current = await this.findCopyById(copy.id);
    if (!current) throw new ProblemError("not-found", { detail: "Exemplar não encontrado." });
    throw new ProblemError("version-conflict", {
      detail: "O exemplar foi alterado por outra operação; recarregue os dados.",
      currentVersion: current.version,
    });
  }

  async listCopies(filter: ListCopiesFilter): Promise<PageResult<CopyProps>> {
    const cursorId = filter.cursor ? decodeCursor(filter.cursor).id : null;
    const conditions = [];
    if (filter.workId) conditions.push(sql`work_id = ${filter.workId}::uuid`);
    if (filter.status) conditions.push(sql`status = ${filter.status}`);
    if (cursorId) conditions.push(sql`id < ${cursorId}::uuid`);
    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
    const fetchLimit = filter.limit + 1;

    const res = await sql<CopyRow>`
      SELECT id, work_id, barcode, status, version, created_at, updated_at
      FROM circulation.copies
      ${whereClause}
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `.execute(this.#trx);
    return toPage(res.rows.map(mapCopy), filter.limit);
  }

  async countByWork(workId: string): Promise<CopyCountsByWork> {
    const copyRes = await sql<{ status: CopyStatus; total: string | number }>`
      SELECT status, COUNT(*)::int AS total
      FROM circulation.copies
      WHERE work_id = ${workId}::uuid
      GROUP BY status
    `.execute(this.#trx);

    let availableCopies = 0;
    let onLoanCopies = 0;
    let reservedCopies = 0;
    let retiredCopies = 0;
    for (const row of copyRes.rows) {
      const n = Number(row.total);
      if (row.status === "available") availableCopies = n;
      else if (row.status === "on-loan") onLoanCopies = n;
      else if (row.status === "reserved") reservedCopies = n;
      else if (row.status === "retired") retiredCopies = n;
    }

    const holdRes = await sql<{ total: string | number }>`
      SELECT COUNT(*)::int AS total
      FROM circulation.holds
      WHERE work_id = ${workId}::uuid AND status = 'waiting'
    `.execute(this.#trx);

    return {
      availableCopies,
      onLoanCopies,
      reservedCopies,
      retiredCopies,
      waitingHolds: Number(holdRes.rows[0]?.total ?? 0),
    };
  }

  async #insertLoanIfAbsent(loan: LoanProps): Promise<void> {
    try {
      await sql`
        INSERT INTO circulation.loans (
          id, copy_id, student_id, work_id, loan_date, due_date, returned_at, renewals_count, status, version
        ) VALUES (
          ${loan.id}::uuid,
          ${loan.copyId}::uuid,
          ${loan.studentId}::uuid,
          ${loan.workId}::uuid,
          ${loan.loanDate},
          ${loan.dueDate},
          ${loan.returnedAt},
          ${loan.renewalsCount},
          ${loan.status},
          ${loan.version}
        )
        ON CONFLICT (id) DO NOTHING
      `.execute(this.#trx);
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new ProblemError("invalid-copy-state", { detail: "Exemplar já possui empréstimo aberto." });
      }
      throw error;
    }
  }

  async findLoanById(loanId: string): Promise<LoanProps | null> {
    const res = await sql<LoanRow>`
      SELECT id, copy_id, student_id, work_id, loan_date, due_date, returned_at, renewals_count, status, version
      FROM circulation.loans
      WHERE id = ${loanId}::uuid
      LIMIT 1
    `.execute(this.#trx);
    return res.rows[0] ? mapLoan(res.rows[0]) : null;
  }

  async findOpenLoanByCopyId(copyId: string): Promise<LoanProps | null> {
    const res = await sql<LoanRow>`
      SELECT id, copy_id, student_id, work_id, loan_date, due_date, returned_at, renewals_count, status, version
      FROM circulation.loans
      WHERE copy_id = ${copyId}::uuid AND status = 'open'
      LIMIT 1
    `.execute(this.#trx);
    return res.rows[0] ? mapLoan(res.rows[0]) : null;
  }

  async updateLoanWithVersion(loan: LoanProps, expectedVersion: number): Promise<LoanProps> {
    const res = await sql<LoanRow>`
      UPDATE circulation.loans
      SET
        due_date = ${loan.dueDate},
        returned_at = ${loan.returnedAt},
        renewals_count = ${loan.renewalsCount},
        status = ${loan.status},
        version = version + 1,
        updated_at = now()
      WHERE id = ${loan.id}::uuid AND version = ${expectedVersion}
      RETURNING id, copy_id, student_id, work_id, loan_date, due_date, returned_at, renewals_count, status, version
    `.execute(this.#trx);
    if (res.rows[0]) return mapLoan(res.rows[0]);

    const current = await this.findLoanById(loan.id);
    if (!current) throw new ProblemError("not-found", { detail: "Empréstimo não encontrado." });
    throw new ProblemError("version-conflict", {
      detail: "O empréstimo foi modificado em paralelo; recarregue os dados.",
      currentVersion: current.version,
    });
  }

  async listOpenLoansByStudent(studentId: string): Promise<LoanProps[]> {
    const res = await sql<LoanRow>`
      SELECT id, copy_id, student_id, work_id, loan_date, due_date, returned_at, renewals_count, status, version
      FROM circulation.loans
      WHERE student_id = ${studentId}::uuid AND status = 'open'
      ORDER BY id DESC
    `.execute(this.#trx);
    return res.rows.map(mapLoan);
  }

  async insertFine(fine: FineProps): Promise<FineProps> {
    const res = await sql<FineRow>`
      INSERT INTO circulation.fines (
        id, student_id, loan_id, overdue_days, daily_rate_cents, amount_cents, status, created_at, paid_at, version
      ) VALUES (
        ${fine.id}::uuid,
        ${fine.studentId}::uuid,
        ${fine.loanId}::uuid,
        ${fine.overdueDays},
        ${fine.dailyRate.cents},
        ${fine.amount.cents},
        ${fine.status},
        ${fine.createdAt}::timestamptz,
        ${fine.paidAt}::timestamptz,
        ${fine.version}
      )
      RETURNING id, student_id, loan_id, overdue_days, daily_rate_cents, amount_cents, status, created_at, paid_at, version
    `.execute(this.#trx);
    return mapFine(res.rows[0]!);
  }

  async findFineById(fineId: string): Promise<FineProps | null> {
    const res = await sql<FineRow>`
      SELECT id, student_id, loan_id, overdue_days, daily_rate_cents, amount_cents, status, created_at, paid_at, version
      FROM circulation.fines
      WHERE id = ${fineId}::uuid
      LIMIT 1
    `.execute(this.#trx);
    return res.rows[0] ? mapFine(res.rows[0]) : null;
  }

  async updateFineWithVersion(fine: FineProps, expectedVersion: number): Promise<FineProps> {
    const res = await sql<FineRow>`
      UPDATE circulation.fines
      SET status = ${fine.status}, paid_at = ${fine.paidAt}::timestamptz, version = version + 1
      WHERE id = ${fine.id}::uuid AND version = ${expectedVersion}
      RETURNING id, student_id, loan_id, overdue_days, daily_rate_cents, amount_cents, status, created_at, paid_at, version
    `.execute(this.#trx);
    if (res.rows[0]) return mapFine(res.rows[0]);

    const current = await this.findFineById(fine.id);
    if (!current) throw new ProblemError("not-found", { detail: "Multa não encontrada." });
    throw new ProblemError("version-conflict", {
      detail: "A multa foi atualizada por outra operação; recarregue antes de quitar.",
      currentVersion: current.version,
    });
  }

  async #listPendingFinesByStudent(studentId: string): Promise<FineProps[]> {
    const res = await sql<FineRow>`
      SELECT id, student_id, loan_id, overdue_days, daily_rate_cents, amount_cents, status, created_at, paid_at, version
      FROM circulation.fines
      WHERE student_id = ${studentId}::uuid AND status = 'pending'
      ORDER BY id DESC
    `.execute(this.#trx);
    return res.rows.map(mapFine);
  }

  async listFinesByStudent(studentId: string): Promise<FineProps[]> {
    const res = await sql<FineRow>`
      SELECT id, student_id, loan_id, overdue_days, daily_rate_cents, amount_cents, status, created_at, paid_at, version
      FROM circulation.fines
      WHERE student_id = ${studentId}::uuid
      ORDER BY id DESC
    `.execute(this.#trx);
    return res.rows.map(mapFine);
  }

  async insertHold(hold: HoldProps): Promise<HoldProps> {
    try {
      const res = await sql<HoldRow>`
        INSERT INTO circulation.holds (
          id, work_id, student_id, assigned_copy_id, status, created_at, expires_at, version
        ) VALUES (
          ${hold.id}::uuid,
          ${hold.workId}::uuid,
          ${hold.studentId}::uuid,
          ${hold.assignedCopyId}::uuid,
          ${hold.status},
          ${hold.createdAt}::timestamptz,
          ${hold.expiresAt}::timestamptz,
          ${hold.version}
        )
        RETURNING id, work_id, student_id, assigned_copy_id, status, created_at, expires_at, version
      `.execute(this.#trx);
      return mapHold(res.rows[0]!);
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new ProblemError("hold-already-exists", { detail: "Aluno já possui reserva ativa para esta obra." });
      }
      throw error;
    }
  }

  async findHoldById(holdId: string): Promise<HoldProps | null> {
    const res = await sql<HoldRow>`
      SELECT id, work_id, student_id, assigned_copy_id, status, created_at, expires_at, version
      FROM circulation.holds
      WHERE id = ${holdId}::uuid
      LIMIT 1
    `.execute(this.#trx);
    return res.rows[0] ? mapHold(res.rows[0]) : null;
  }

  async updateHoldWithVersion(hold: HoldProps, expectedVersion: number): Promise<HoldProps> {
    const res = await sql<HoldRow>`
      UPDATE circulation.holds
      SET
        assigned_copy_id = ${hold.assignedCopyId}::uuid,
        status = ${hold.status},
        expires_at = ${hold.expiresAt}::timestamptz,
        version = version + 1
      WHERE id = ${hold.id}::uuid AND version = ${expectedVersion}
      RETURNING id, work_id, student_id, assigned_copy_id, status, created_at, expires_at, version
    `.execute(this.#trx);
    if (res.rows[0]) return mapHold(res.rows[0]);

    const current = await this.findHoldById(hold.id);
    if (!current) throw new ProblemError("not-found", { detail: "Reserva não encontrada." });
    throw new ProblemError("version-conflict", {
      detail: "A reserva foi alterada em paralelo; recarregue os dados.",
      currentVersion: current.version,
    });
  }

  async hasActiveHold(studentId: string, workId: string): Promise<boolean> {
    const res = await sql<{ found: number }>`
      SELECT 1 AS found
      FROM circulation.holds
      WHERE student_id = ${studentId}::uuid AND work_id = ${workId}::uuid AND status IN ('waiting', 'ready')
      LIMIT 1
    `.execute(this.#trx);
    return res.rows.length > 0;
  }

  async hasWaitingHoldForWork(workId: string): Promise<boolean> {
    const res = await sql<{ found: number }>`
      SELECT 1 AS found
      FROM circulation.holds
      WHERE work_id = ${workId}::uuid AND status = 'waiting'
      LIMIT 1
    `.execute(this.#trx);
    return res.rows.length > 0;
  }

  async findNextWaitingHoldFifo(workId: string): Promise<HoldProps | null> {
    const res = await sql<HoldRow>`
      SELECT id, work_id, student_id, assigned_copy_id, status, created_at, expires_at, version
      FROM circulation.holds
      WHERE work_id = ${workId}::uuid AND status = 'waiting'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `.execute(this.#trx);
    return res.rows[0] ? mapHold(res.rows[0]) : null;
  }

  async listActiveHoldsByStudent(studentId: string): Promise<HoldProps[]> {
    const res = await sql<HoldRow>`
      SELECT id, work_id, student_id, assigned_copy_id, status, created_at, expires_at, version
      FROM circulation.holds
      WHERE student_id = ${studentId}::uuid AND status IN ('waiting', 'ready')
      ORDER BY id DESC
    `.execute(this.#trx);
    return res.rows.map(mapHold);
  }

  async listHoldsByStudent(studentId: string): Promise<HoldProps[]> {
    const res = await sql<HoldRow>`
      SELECT id, work_id, student_id, assigned_copy_id, status, created_at, expires_at, version
      FROM circulation.holds
      WHERE student_id = ${studentId}::uuid
      ORDER BY id DESC
      LIMIT 30
    `.execute(this.#trx);
    return res.rows.map(mapHold);
  }
}

export const kyselyCirculationRepository: CirculationRepositoryFactory = (trx) => new KyselyCirculationRepository(trx);
