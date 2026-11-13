// Caso de uso circulation.lend-copy (spec 003 História 1 [1.1]-[1.6], RN-01, RN-02, RN-03, ACL + Conformista).
// Pelo agregado Student: busca o Student inteiro (com os empréstimos em aberto e as multas pendentes), pede
// à raiz (`student.borrow`), que confere as regras e abre o empréstimo, e grava o Student inteiro, só se a
// versão ainda for a lida (dois pedidos ao mesmo tempo: o segundo recebe `version-conflict`).
import type { LendCopyRequest, LoanDto } from "@biblioteca/contract";
import { ProblemError, type UseCase } from "@biblioteca/core";
import { Copy } from "../../domain/copy.ts";
import { type AcademicStudent, CIRCULATION_SCOPE } from "../../domain/ports.ts";
import { Barcode, StudentRegistration } from "../../domain/value-objects.ts";
import { requireActiveAcademicStudent } from "../../infrastructure/academic-translator.ts";
import { type CirculationDeps, resolveClock, resolveRepoFactory, toLoanDto } from "../shared.ts";

export interface PreparedLendCopy {
  readonly academic: AcademicStudent;
  readonly loanDate: string;
  readonly dueDate: string;
  readonly workTitle: string;
}

export function createLendCopyHandler(
  deps: CirculationDeps,
): UseCase<LendCopyRequest, LoanDto, PreparedLendCopy> {
  const repositoryFor = resolveRepoFactory(deps);
  const clock = resolveClock(deps);

  return {
    name: "circulation.lend-copy",
    scope: CIRCULATION_SCOPE,
    allowedRoles: ["librarian"],
    prepare: async ({ input, read }) => {
      const registration = StudentRegistration.of(input.studentRegistration);
      const barcode = Barcode.of(input.barcode);

      const academic = await requireActiveAcademicStudent(deps.academicRegistry, registration);
      const calendar = await deps.calendar.getCalendar();
      const loanDate = clock.todayYmd();
      const dueDate = calendar.computeDueDate(loanDate);

      const copy = await read(CIRCULATION_SCOPE, (trx) => repositoryFor(trx).findCopyByBarcode(barcode));
      if (!copy) {
        throw new ProblemError("not-found", {
          detail: `Exemplar com código de barras '${barcode.value}' não encontrado.`,
        });
      }
      const work = await deps.catalog.getWork(copy.workId);
      return {
        academic,
        loanDate,
        dueDate,
        workTitle: work?.title ?? "Obra não identificada",
      };
    },
    handle: async ({ input, trx, emit, prepared }) => {
      const repo = repositoryFor(trx);
      const nowIso = clock.nowIso();
      const barcode = Barcode.of(input.barcode);

      // 1. Busca o Student inteiro: o aluno (sincronizado com a Secretaria), os empréstimos em aberto e as multas.
      const synced = await repo.upsertStudentFromAcademic(prepared.academic, nowIso);
      const student = await repo.loadStudent(synced.id);
      if (!student) {
        throw new ProblemError("internal-error", { detail: "Aluno não encontrado depois da sincronização." });
      }
      const studentProps = student.props;

      const copyProps = await repo.findCopyByBarcode(barcode);
      if (!copyProps) {
        throw new ProblemError("not-found", {
          detail: `Exemplar com código de barras '${barcode.value}' não encontrado.`,
        });
      }

      // 2. Pede à raiz: multa pendente (RN-01) ou 3 em aberto (RN-02) recusam; senão, o empréstimo nasce dentro do Student.
      const borrowed = student.borrow(
        { copyId: copyProps.id, workId: copyProps.workId, loanDate: prepared.loanDate, dueDate: prepared.dueDate },
        nowIso,
      );

      const nextCopy = Copy.reconstitute(copyProps).lend(nowIso);
      const savedCopy = await repo.updateCopyWithVersion(nextCopy.props, copyProps.version);

      // 3. Grava o Student inteiro, na mesma transação, só se a versão ainda for a lida.
      await repo.saveStudent(borrowed.student, studentProps.version);
      const savedLoan = borrowed.loan.props;

      emit({
        action: "loan.created",
        resourceType: "loan",
        resourceId: savedLoan.id,
        changes: {
          barcode: savedCopy.barcode.value,
          studentRegistration: studentProps.registration.value,
          dueDate: savedLoan.dueDate,
        },
      });

      return toLoanDto(savedLoan, {
        barcode: savedCopy.barcode,
        workTitle: prepared.workTitle,
        studentRegistration: studentProps.registration,
      });
    },
  };
}
