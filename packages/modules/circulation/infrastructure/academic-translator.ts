// Camada Anticorrupção (ACL) da Secretaria Acadêmica externa (ADR-0006, ADR-0023, spec 003).
import { ProblemError } from "@biblioteca/core";
import type { AcademicRegistryPort, AcademicStudent } from "../domain/ports.ts";
import { Email, StudentRegistration } from "../domain/value-objects.ts";

/** Formato bruto vindo do sistema legado da Secretaria Acadêmica (não vaza para o domínio). */
export interface RawSecretariaRecord {
  readonly ra: string;
  readonly nome_civil: string;
  readonly sit_matricula: "MATRICULADO" | "TRANCADO" | "CANCELADO" | "CONCLUIDO" | string;
  readonly cod_curso: string;
  readonly email_institucional: string;
}

export function translateAcademicStudent(raw: RawSecretariaRecord): AcademicStudent {
  const normalizedStatus = raw.sit_matricula.trim().toUpperCase();
  return {
    registration: StudentRegistration.of(raw.ra),
    name: raw.nome_civil.trim(),
    email: translateEmail(raw),
    enrollmentStatus: normalizedStatus === "MATRICULADO" ? "active" : "inactive",
    rawStatus: normalizedStatus,
    courseCode: raw.cod_curso.trim(),
  };
}

/**
 * A Secretaria não padroniza maiúsculas no e-mail institucional: a tradução o grava todo em minúsculas, e o Email do
 * domínio confere o formato. E-mail inválido é defeito do sistema de fora, não do pedido: não entra no domínio e
 * volta como falha da integração, e não como erro de validação de um campo que o pedido nem tem.
 */
function translateEmail(raw: RawSecretariaRecord): Email {
  try {
    return Email.of(raw.email_institucional.toLowerCase());
  } catch {
    throw new ProblemError("internal-error", {
      detail: `A Secretaria Acadêmica devolveu um e-mail institucional inválido para a matrícula '${raw.ra.trim()}'.`,
    });
  }
}

export async function requireActiveAcademicStudent(
  registry: AcademicRegistryPort,
  registration: StudentRegistration,
): Promise<AcademicStudent> {
  const student = await registry.findByRegistration(registration);
  if (!student) {
    throw new ProblemError("not-found", {
      detail: `Matrícula '${registration.value}' não encontrada na Secretaria Acadêmica.`,
    });
  }
  if (student.enrollmentStatus !== "active") {
    throw new ProblemError("student-inactive", {
      detail: `Matrícula '${registration.value}' (${student.name}) está com situação '${student.rawStatus}' na Secretaria.`,
    });
  }
  return student;
}

export const DEFAULT_SECRETARIA_RECORDS: readonly RawSecretariaRecord[] = [
  {
    ra: "2026-0001",
    nome_civil: "Ana Beatriz Silva",
    sit_matricula: "MATRICULADO",
    cod_curso: "CC-01",
    email_institucional: "ana@alu.edu.br",
  },
  {
    ra: "2026-0002",
    nome_civil: "Bruno Costa Oliveira",
    sit_matricula: "MATRICULADO",
    cod_curso: "SI-02",
    email_institucional: "bruno@alu.edu.br",
  },
  {
    ra: "2026-0003",
    nome_civil: "Carla Mendes Souza",
    sit_matricula: "TRANCADO",
    cod_curso: "ES-03",
    email_institucional: "carla@alu.edu.br",
  },
];

export class InMemoryAcademicRegistry implements AcademicRegistryPort {
  readonly #records = new Map<string, RawSecretariaRecord>();

  constructor(initialRecords: readonly RawSecretariaRecord[] = DEFAULT_SECRETARIA_RECORDS) {
    for (const r of initialRecords) {
      this.putRawRecord(r);
    }
  }

  putRawRecord(raw: RawSecretariaRecord): void {
    this.#records.set(StudentRegistration.of(raw.ra).value, raw);
  }

  async findByRegistration(registration: StudentRegistration): Promise<AcademicStudent | null> {
    const raw = this.#records.get(registration.value);
    return raw ? translateAcademicStudent(raw) : null;
  }
}
