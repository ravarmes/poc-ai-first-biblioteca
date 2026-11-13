import type { ProblemError } from "@biblioteca/core";
import { describe, expect, test } from "vitest";
import { Email, StudentRegistration } from "../domain/value-objects.ts";
import { InMemoryAcademicRegistry, requireActiveAcademicStudent, translateAcademicStudent } from "./academic-translator.ts";
import { ConformistCalendarClient, generateAcademicDaysRange } from "./calendar-client.ts";

describe("Integrações ACL (Secretaria) e Conformista (Calendário)", () => {
  test("[ACL] traduz campos brutos da Secretaria e bloqueia matrícula trancada", async () => {
    const translated = translateAcademicStudent({
      ra: " 2026-0099 ",
      nome_civil: " João Pereira ",
      sit_matricula: "CONCLUIDO",
      cod_curso: "EC-01",
      email_institucional: "JOAO@ALU.EDU.BR ",
    });
    expect(translated).toEqual({
      registration: StudentRegistration.of("2026-0099"),
      name: "João Pereira",
      email: Email.of("joao@alu.edu.br"),
      enrollmentStatus: "inactive",
      rawStatus: "CONCLUIDO",
      courseCode: "EC-01",
    });

    // E-mail inválido vindo da Secretaria não entra no domínio: volta como falha da integração
    const badEmail = (() => {
      try {
        translateAcademicStudent({
          ra: "2026-0098",
          nome_civil: "Rita Souza",
          sit_matricula: "MATRICULADO",
          cod_curso: "EC-01",
          email_institucional: "rita@localhost",
        });
      } catch (err) {
        return err as ProblemError;
      }
      throw new Error("Esperava um ProblemError");
    })();
    expect(badEmail.code).toBe("internal-error");
    expect(badEmail.detail).toBe(
      "A Secretaria Acadêmica devolveu um e-mail institucional inválido para a matrícula '2026-0098'.",
    );

    const registry = new InMemoryAcademicRegistry();
    const ana = await requireActiveAcademicStudent(registry, StudentRegistration.of("2026-0001"));
    expect(ana.enrollmentStatus).toBe("active");

    await expect(requireActiveAcademicStudent(registry, StudentRegistration.of("2026-0003"))).rejects.toMatchObject({
      code: "student-inactive",
    });
    await expect(requireActiveAcademicStudent(registry, StudentRegistration.of("2026-9999"))).rejects.toMatchObject({
      code: "not-found",
    });
  });

  test("[Conformista] Calendário consome dias_letivos diretamente e pula feriados/fins de semana", async () => {
    const client = new ConformistCalendarClient({
      dias_letivos: generateAcademicDaysRange(2026, 2026),
    });
    const calendar = await client.getCalendar();
    expect(calendar.days).not.toContain("2026-11-15");
    expect(calendar.computeDueDate("2026-11-10")).toBe("2026-12-01");
  });
});
