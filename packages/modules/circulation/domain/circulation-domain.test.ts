import { newUuidV7, ProblemError } from "@biblioteca/core";
import { describe, expect, test } from "vitest";
import { countOverdueDays, DEFAULT_LOAN_SCHOOL_DAYS, SchoolCalendar } from "./calendar.ts";
import { Copy } from "./copy.ts";
import { calculateOverdueFine, Fine, type FineProps } from "./fine.ts";
import { Hold } from "./hold.ts";
import { Loan } from "./loan.ts";
import { CIRCULATION_SCOPE } from "./ports.ts";
import { type AcademicStudent, Student } from "./student.ts";
import {
  addUtcDaysIso,
  Barcode,
  Email,
  FixedClock,
  Money,
  StudentRegistration,
  SystemClock,
} from "./value-objects.ts";

describe("Domínio puro de Circulação (invariantes, máquina de estados e calendário)", () => {
  test("define CIRCULATION_SCOPE como mod_circulation no schema circulation", () => {
    expect(CIRCULATION_SCOPE).toEqual({ role: "mod_circulation", searchPath: "circulation" });
  });

  test("[RN-01] [RN-02] [RN-03] agregado Student: a raiz empresta até 3 em aberto, recusa o 4º e a multa pendente e sincroniza nome/e-mail", () => {
    const academic: AcademicStudent = {
      registration: StudentRegistration.of("2026-0001"),
      name: "  Ana Silva  ",
      email: Email.of("ana@alu.edu.br"),
      enrollmentStatus: "active",
      rawStatus: "MATRICULADO",
      courseCode: "CC",
    };
    const student = Student.fromAcademic(academic, "2026-11-10T10:00:00.000Z");
    expect(student.props.name).toBe("Ana Silva");
    expect(student.props.registration.value).toBe("2026-0001");
    expect(student.props.email.value).toBe("ana@alu.edu.br");

    expect(student.openLoans).toHaveLength(0);
    expect(student.pendingFines).toHaveLength(0);

    // A raiz empresta: cada borrow abre o Loan dentro do agregado e sobe a versão; o Student lido não muda
    const t1 = "2026-11-10T10:05:00.000Z";
    const request = (copyId: string) => ({ copyId, workId: "work-1", loanDate: "2026-11-10", dueDate: "2026-11-30" });
    const first = student.borrow(request("copy-1"), t1);
    expect(first.loan.props).toMatchObject({
      copyId: "copy-1",
      studentId: student.props.id,
      workId: "work-1",
      loanDate: "2026-11-10",
      dueDate: "2026-11-30",
      status: "open",
    });
    expect(first.student.openLoans.map((loan) => loan.props.id)).toEqual([first.loan.props.id]);
    expect(first.student.props.version).toBe(2);
    expect(first.student.props.updatedAt).toBe(t1);
    expect(student.openLoans).toHaveLength(0);
    expect(student.props.version).toBe(1);

    const second = first.student.borrow(request("copy-2"), t1);
    const third = second.student.borrow(request("copy-3"), t1);
    expect(third.student.openLoans.map((loan) => loan.props.copyId)).toEqual(["copy-1", "copy-2", "copy-3"]);
    expect(third.student.props.version).toBe(4);

    // O 4º: com 3 em aberto, a própria raiz recusa (RN-02, "< 3" estrito) e nada muda
    try {
      third.student.borrow(request("copy-4"), t1);
      expect.fail("Esperava loan-limit-reached");
    } catch (err) {
      expect((err as ProblemError).code).toBe("loan-limit-reached");
      expect((err as ProblemError).detail).toBe("O aluno Ana Silva já atingiu o limite de 3 empréstimos em aberto.");
    }
    expect(third.student.openLoans).toHaveLength(3);

    // Lido do banco: com 3 em aberto recusa; com 2, empresta
    const openLoans = third.student.openLoans.map((loan) => loan.props);
    const withThree = Student.reconstitute(student.props, { openLoans, pendingFines: [] });
    expect(withThree.openLoans).toHaveLength(3);
    expect(() => withThree.borrow(request("copy-4"), t1)).toThrowError(/limite de 3 empréstimos/);
    const withTwo = Student.reconstitute(student.props, { openLoans: openLoans.slice(0, 2), pendingFines: [] });
    expect(withTwo.borrow(request("copy-4"), t1).student.openLoans).toHaveLength(3);

    // Multa pendente, dentro do agregado, bloqueia empréstimo e renovação, e a recusa diz quanto o aluno deve
    const pendingFine: FineProps = {
      id: "fine-1",
      studentId: student.props.id,
      loanId: first.loan.props.id,
      overdueDays: 2,
      dailyRate: Money.ofCents(100),
      amount: Money.ofCents(200),
      status: "pending",
      createdAt: t1,
      paidAt: null,
      version: 1,
    };
    const withFine = Student.reconstitute(student.props, { openLoans: [], pendingFines: [pendingFine] });
    expect(withFine.pendingFines.map((fine) => fine.props.id)).toEqual(["fine-1"]);
    expect(student.pendingFineTotal().equals(Money.zero())).toBe(true);
    const secondFine: FineProps = { ...pendingFine, id: "fine-2", overdueDays: 1, amount: Money.ofCents(150) };
    const withTwoFines = Student.reconstitute(student.props, { openLoans: [], pendingFines: [pendingFine, secondFine] });
    expect(withTwoFines.pendingFineTotal().format()).toBe("R$ 3,50");
    try {
      withFine.borrow(request("copy-9"), t1);
      expect.fail("Esperava pending-fine");
    } catch (err) {
      expect((err as ProblemError).code).toBe("pending-fine");
      expect((err as ProblemError).detail).toBe(
        "O aluno Ana Silva (2026-0001) possui multa pendente de R$ 2,00 e não pode retirar exemplares.",
      );
    }
    try {
      withFine.ensureCanRenew();
      expect.fail("Esperava pending-fine na renovação");
    } catch (err) {
      expect((err as ProblemError).code).toBe("pending-fine");
      expect((err as ProblemError).detail).toBe(
        "O aluno Ana Silva possui multa pendente de R$ 2,00; regularize antes de renovar.",
      );
    }
    expect(() => student.ensureCanRenew()).not.toThrow();

    // Reserva duplicada na mesma obra
    try {
      student.ensureCanPlaceHold(true);
      expect.fail("Esperava hold-already-exists");
    } catch (err) {
      expect((err as ProblemError).code).toBe("hold-already-exists");
      expect((err as ProblemError).detail).toBe("O aluno 2026-0001 já possui uma reserva ativa para esta obra.");
    }
    expect(() => student.ensureCanPlaceHold(false)).not.toThrow();

    // Sync com o mesmo e-mail (outro objeto, mesmo valor) e o nome com espaços não incrementa versão
    const same = student.syncWithAcademic(
      { ...academic, name: " Ana Silva ", email: Email.of(" ana@ALU.EDU.BR ") },
      "2026-11-10T11:00:00.000Z",
    );
    expect(same.props.version).toBe(1);

    // Sync alterando apenas o e-mail incrementa versão
    const emailUpdated = same.syncWithAcademic(
      { ...academic, email: Email.of("ana.novo@alu.edu.br") },
      "2026-11-10T11:30:00.000Z",
    );
    expect(emailUpdated.props.version).toBe(2);
    expect(emailUpdated.props.email.value).toBe("ana.novo@alu.edu.br");

    const nameUpdated = emailUpdated.syncWithAcademic(
      { ...academic, email: Email.of("ana.novo@alu.edu.br"), name: "Ana Maria Silva" },
      "2026-11-10T12:00:00.000Z",
    );
    expect(nameUpdated.props.version).toBe(3);
    expect(nameUpdated.props.name).toBe("Ana Maria Silva");

    // A sincronização muda só os dados do aluno: os empréstimos e as multas continuam no agregado
    const synced = withFine.syncWithAcademic({ ...academic, name: "Ana S." }, "2026-11-10T12:30:00.000Z");
    expect(synced.props.name).toBe("Ana S.");
    expect(synced.pendingFines).toHaveLength(1);
    const syncedWithLoans = withThree.syncWithAcademic({ ...academic, name: "Ana S." }, "2026-11-10T12:30:00.000Z");
    expect(syncedWithLoans.openLoans).toHaveLength(3);
  });

  test("[RN-02] [RN-07] máquina de estados de Copy incrementa versão em toda transição e rejeita estados inválidos", () => {
    const t0 = "2026-11-10T10:00:00.000Z";
    const copy = Copy.register({ workId: newUuidV7(), barcode: " ex-001 " }, t0);
    expect(copy.props.barcode.equals(Barcode.of("EX-001"))).toBe(true);
    expect(copy.props.status).toBe("available");
    expect(copy.props.version).toBe(1);

    expect(() => copy.returnToPool(false, t0)).toThrowError(/não está emprestado/);
    expect(() => copy.withdrawFromReservation(t0)).toThrowError(/precisa estar reservado/);
    expect(() => copy.releaseReservation(false, t0)).toThrowError(/não está no estado reservado/);

    const onLoan = copy.lend(t0);
    expect(onLoan.props.status).toBe("on-loan");
    expect(onLoan.props.version).toBe(2);
    expect(() => onLoan.lend(t0)).toThrowError(/não pode ser emprestado/);
    expect(() => onLoan.retire(2, t0)).toThrowError(/baixa definitiva/);

    const reserved = onLoan.returnToPool(true, t0);
    expect(reserved.props.status).toBe("reserved");
    expect(reserved.props.version).toBe(3);

    const backAvailable = reserved.releaseReservation(false, t0);
    expect(backAvailable.props.status).toBe("available");
    expect(backAvailable.props.version).toBe(4);

    const stillReserved = reserved.releaseReservation(true, t0);
    expect(stillReserved.props.status).toBe("reserved");
    expect(stillReserved.props.version).toBe(4);

    const onLoanAgain = reserved.withdrawFromReservation(t0);
    expect(onLoanAgain.props.status).toBe("on-loan");
    expect(onLoanAgain.props.version).toBe(4);

    const availableAgain = onLoanAgain.returnToPool(false, t0);
    expect(availableAgain.props.version).toBe(5);
    expect(() => availableAgain.retire(99, t0)).toThrowError(/alterado/);
    const retired = availableAgain.retire(availableAgain.props.version, t0);
    expect(retired.props.status).toBe("retired");
    expect(retired.props.version).toBe(6);
    expect(() => retired.lend(t0)).toThrowError(/não pode ser emprestado/);
  });

  test("[RN-04] [RN-05] calendário de 14 dias letivos, saneamento/ordenação de datas e cálculo de multa", () => {
    // 16 datas com duplicatas, fora de ordem e entradas inválidas (inclusive prefixo/sufixo ruim)
    const dirtyDays = [
      "2026-11-30",
      "invalida",
      "x2026-12-01",
      "2026-12-01x",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-10",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
    ];
    const cal = new SchoolCalendar(dirtyDays);
    expect(cal.days).toHaveLength(15);
    expect(cal.days[0]).toBe("2026-11-10");
    expect(cal.days.at(-1)).toBe("2026-11-30");
    expect(DEFAULT_LOAN_SCHOOL_DAYS).toBe(14);
    expect(cal.computeDueDate("2026-11-10")).toBe("2026-11-30");
    expect(cal.computeDueDate("2026-11-10", 1)).toBe("2026-11-11");
    expect(() => cal.computeDueDate("2026-11-25")).toThrowError(/dias letivos suficientes/);
    expect(() => cal.computeDueDate("2026-11-10", 0)).toThrowError(/positiva/);

    expect(countOverdueDays("2026-11-30", "2026-11-29")).toBe(0);
    expect(countOverdueDays("2026-11-30", "2026-11-30")).toBe(0);
    expect(countOverdueDays("2026-11-30", "2026-12-03")).toBe(3);

    // Ambas as datas inválidas (returned > due em ordem lexicográfica) lançam validation-error
    for (const [d, r] of [
      ["2026-11-10", "2026-12-99"],
      ["2026-11-99", "2026-12-01"],
    ] as const) {
      try {
        countOverdueDays(d, r);
        expect.fail("Deveria rejeitar data inválida");
      } catch (err) {
        expect((err as ProblemError).code).toBe("validation-error");
        expect((err as ProblemError).detail).toBe("Formato de data inválido no cálculo de atraso.");
      }
    }

    expect(calculateOverdueFine(1, Money.ofCents(1)).cents).toBe(1);
    expect(calculateOverdueFine(3, Money.ofCents(100)).cents).toBe(300);
    expect(calculateOverdueFine(1, Money.ofCents(250)).cents).toBe(250);
    expect(() => calculateOverdueFine(0, Money.ofCents(100))).toThrowError(/positivos/);
    expect(() => calculateOverdueFine(2, Money.zero())).toThrowError(/positivo/);

    expect(
      Fine.createIfOverdue({
        studentId: newUuidV7(),
        loanId: newUuidV7(),
        dueDateYmd: "2026-11-30",
        returnedDateYmd: "2026-11-30",
        dailyRate: Money.ofCents(100),
        nowIso: "2026-11-30T15:00:00.000Z",
      }),
    ).toBeNull();

    const fine = Fine.createIfOverdue({
      studentId: newUuidV7(),
      loanId: newUuidV7(),
      dueDateYmd: "2026-11-30",
      returnedDateYmd: "2026-12-03",
      dailyRate: Money.ofCents(250),
      nowIso: "2026-12-03T15:00:00.000Z",
    })!;
    expect(fine.props.overdueDays).toBe(3);
    expect(fine.props.amount.equals(Money.ofCents(750))).toBe(true);
    expect(() => fine.pay(2, "2026-12-04T10:00:00.000Z")).toThrowError(/atualizada/);

    const paid = fine.pay(1, "2026-12-04T10:00:00.000Z");
    expect(paid.props.status).toBe("paid");
    expect(paid.props.version).toBe(2);
    try {
      paid.pay(2, "2026-12-04T11:00:00.000Z");
      expect.fail("Deveria rejeitar multa já quitada");
    } catch (err) {
      expect((err as ProblemError).code).toBe("fine-already-paid");
      expect((err as ProblemError).detail).toBe("Esta multa já foi quitada anteriormente.");
    }
  });

  test("[RN-06] [RN-07] ciclo completo de Loan e janela de 3 dias de Hold (incluindo expiresAt null)", () => {
    const loan = Loan.open({
      copyId: newUuidV7(),
      studentId: newUuidV7(),
      workId: newUuidV7(),
      loanDate: "2026-11-10",
      dueDate: "2026-11-30",
    });
    expect(() => loan.renew("2026-12-18", 9)).toThrowError(/modificado/);
    const renewed = loan.renew("2026-12-18", 1);
    expect(renewed.props.renewalsCount).toBe(1);
    expect(renewed.props.version).toBe(2);

    const closed = renewed.close("2026-12-10");
    expect(closed.props.status).toBe("returned");
    expect(closed.props.version).toBe(3);
    expect(() => closed.renew("2026-12-30", 3)).toThrowError(/não podem ser renovados/);
    expect(() => closed.close("2026-12-11")).toThrowError(/encerrado/);

    const hold = Hold.place({
      workId: newUuidV7(),
      studentId: newUuidV7(),
      nowIso: "2026-11-10T10:00:00.000Z",
    });
    expect(() => hold.fulfill(1, "2026-11-10T10:00:00.000Z")).toThrowError(/não está pronta/);
    expect(() => hold.expire(1, "2026-11-10T10:00:00.000Z")).toThrowError(/aguardando retirada/);

    const ready = hold.assignCopy(newUuidV7(), "2026-11-10T12:00:00.000Z");
    expect(ready.props.expiresAt).toBe("2026-11-13T12:00:00.000Z");
    expect(ready.props.version).toBe(2);
    expect(() => ready.assignCopy(newUuidV7(), "2026-11-10T13:00:00.000Z")).toThrowError(/aguardando/);

    // Exatamente no instante limite (<=) ainda pode retirar e NÃO pode expirar
    expect(() => ready.expire(2, "2026-11-13T12:00:00.000Z")).toThrowError(/ainda está em vigor/);
    expect(() => ready.fulfill(99, "2026-11-13T12:00:00.000Z")).toThrowError(/alterada/);
    const fulfilled = ready.fulfill(2, "2026-11-13T12:00:00.000Z");
    expect(fulfilled.props.status).toBe("fulfilled");
    expect(fulfilled.props.version).toBe(3);

    // 1 ms após o prazo (>), retirar falha com hold-expired e expirar funciona
    expect(() => ready.fulfill(2, "2026-11-13T12:00:00.001Z")).toThrowError(/expirou/);
    expect(() => ready.expire(99, "2026-11-13T12:00:00.001Z")).toThrowError(/alterada/);
    const expired = ready.expire(2, "2026-11-13T12:00:00.001Z");
    expect(expired.props.status).toBe("expired");
    expect(expired.props.version).toBe(3);

    // Reserva ready reconstituída sem expiresAt permite fulfill/expire sem erro de prazo
    const readyNoExpiry = Hold.reconstitute({ ...ready.props, expiresAt: null });
    expect(readyNoExpiry.fulfill(2, "2026-11-13T12:00:00.001Z").props.status).toBe("fulfilled");
    expect(readyNoExpiry.expire(2, "2026-11-13T12:00:00.001Z").props.status).toBe("expired");
  });

  test("addUtcDaysIso, SystemClock e FixedClock", () => {
    expect(addUtcDaysIso("2026-11-10T00:00:00.000Z", 3)).toBe("2026-11-13T00:00:00.000Z");
    try {
      addUtcDaysIso("nao-e-iso", 3);
      expect.fail("Deveria rejeitar ISO inválido");
    } catch (err) {
      expect((err as ProblemError).code).toBe("internal-error");
      expect((err as ProblemError).detail).toBe("Data ISO inválida no cálculo de prazo: nao-e-iso");
    }

    const sysClock = new SystemClock();
    const sysIso = sysClock.nowIso();
    expect(sysIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(sysClock.todayYmd()).toBe(sysIso.slice(0, 10));

    const clock = new FixedClock("2026-11-10T09:00:00.000Z");
    expect(clock.todayYmd()).toBe("2026-11-10");
    clock.advanceDays(5);
    expect(clock.todayYmd()).toBe("2026-11-15");
    clock.setNow("2026-11-20T12:00:00.000Z");
    expect(clock.todayYmd()).toBe("2026-11-20");
  });
});

function problemOf(fn: () => unknown): ProblemError {
  try {
    fn();
  } catch (err) {
    return err as ProblemError;
  }
  throw new Error("Esperava um ProblemError");
}

describe("Objetos de valor de Circulação (sem identidade, iguais pelo valor, nascem válidos)", () => {
  test("Barcode nasce sem espaços e em maiúsculas, recusa o inválido e compara pelo valor", () => {
    expect(Barcode.of(" bib-10 ").value).toBe("BIB-10");
    expect(Barcode.of(" bib-10 ").equals(Barcode.of("BIB-10"))).toBe(true);
    expect(Barcode.of("BIB-10").equals(Barcode.of("BIB-11"))).toBe(false);
    for (const bad of ["ab", "!EX-01", "EX-01!"]) {
      const problem = problemOf(() => Barcode.of(bad));
      expect(problem.code).toBe("validation-error");
      expect(problem.detail).toBe("Código de barras inválido.");
      expect(problem.errors).toEqual([
        { field: "barcode", message: "deve ter entre 4 e 32 caracteres alfanuméricos ou hífen" },
      ]);
    }
  });

  test("StudentRegistration nasce sem espaços, recusa o inválido e compara pelo valor", () => {
    expect(StudentRegistration.of(" 2026-0001 ").value).toBe("2026-0001");
    expect(StudentRegistration.of(" 2026-0001 ").equals(StudentRegistration.of("2026-0001"))).toBe(true);
    expect(StudentRegistration.of("2026-0001").equals(StudentRegistration.of("2026-0002"))).toBe(false);
    for (const bad of ["1", "!2026-01", "2026_01!"]) {
      const problem = problemOf(() => StudentRegistration.of(bad));
      expect(problem.code).toBe("validation-error");
      expect(problem.detail).toBe("Matrícula acadêmica inválida.");
      expect(problem.errors).toEqual([
        { field: "studentRegistration", message: "deve ter entre 3 e 32 caracteres alfanuméricos ou hífen" },
      ]);
    }
  });

  test("Email nasce sem espaços e com o domínio em minúsculas, recusa o inválido e compara pelo valor", () => {
    expect(Email.of(" marta@Escola.Example ").value).toBe("marta@escola.example");
    // Só o domínio vai para minúsculas: a parte antes do @ fica como veio
    expect(Email.of("Ana.SILVA@ALU.EDU.BR").value).toBe("Ana.SILVA@alu.edu.br");
    expect(Email.of(" marta@Escola.Example ").equals(Email.of("marta@escola.example"))).toBe(true);
    expect(Email.of("MARTA@escola.example").equals(Email.of("marta@escola.example"))).toBe(false);
    const bads = [
      "marta.escola.example",
      "marta@escola",
      "@escola.example",
      "marta silva@escola.example",
      "marta@escola.example x",
    ];
    for (const bad of bads) {
      const problem = problemOf(() => Email.of(bad));
      expect(problem.code).toBe("validation-error");
      expect(problem.detail).toBe("E-mail inválido.");
      expect(problem.errors).toEqual([{ field: "email", message: "deve ter um @ e um domínio com ponto, sem espaços" }]);
    }
  });

  test("Money guarda centavos inteiros, soma, multiplica, compara pelo valor e se escreve em reais", () => {
    expect(Money.ofCents(0).cents).toBe(0);
    expect(Money.zero().equals(Money.ofCents(0))).toBe(true);
    expect(Money.ofCents(250).plus(Money.ofCents(100)).cents).toBe(350);
    expect(Money.ofCents(250).times(3).equals(Money.ofCents(750))).toBe(true);
    expect(Money.ofCents(250).equals(Money.ofCents(251))).toBe(false);
    expect(Money.ofCents(350).format()).toBe("R$ 3,50");
    expect(Money.ofCents(5).format()).toBe("R$ 0,05");
    for (const bad of [-1, 1.5]) {
      const problem = problemOf(() => Money.ofCents(bad));
      expect(problem.code).toBe("validation-error");
      expect(problem.detail).toBe("Valor em dinheiro inválido: use centavos inteiros, sem valor negativo.");
    }
    // Multiplicar por fração daria fração de centavo: não nasce
    expect(() => Money.ofCents(1).times(1.5)).toThrowError(/centavos inteiros/);
  });
});
