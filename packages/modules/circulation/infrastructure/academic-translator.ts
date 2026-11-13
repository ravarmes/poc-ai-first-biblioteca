// Camada Anticorrupção (ACL) da Secretaria Acadêmica externa (ADR-0006, ADR-0023, spec 003).
import { ProblemError } from "@biblioteca/core";
import type { AcademicRegistryPort, AcademicStudent } from "../domain/ports.ts";
import { normalizeRegistration } from "../domain/value-objects.ts";

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
    registration: normalizeRegistration(raw.ra),
    name: raw.nome_civil.trim(),
    email: raw.email_institucional.trim().toLowerCase(),
    enrollmentStatus: normalizedStatus === "MATRICULADO" ? "active" : "inactive",
    rawStatus: normalizedStatus,
    courseCode: raw.cod_curso.trim(),
  };
}

export async function requireActiveAcademicStudent(
  registry: AcademicRegistryPort,
  registration: string,
): Promise<AcademicStudent> {
  const normalized = normalizeRegistration(registration);
  const student = await registry.findByRegistration(normalized);
  if (!student) {
    throw new ProblemError("not-found", {
      detail: `Matrícula '${normalized}' não encontrada na Secretaria Acadêmica.`,
    });
  }
  if (student.enrollmentStatus !== "active") {
    throw new ProblemError("student-inactive", {
      detail: `Matrícula '${normalized}' (${student.name}) está com situação '${student.rawStatus}' na Secretaria.`,
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
    this.#records.set(normalizeRegistration(raw.ra), raw);
  }

  async findByRegistration(registration: string): Promise<AcademicStudent | null> {
    const raw = this.#records.get(normalizeRegistration(registration));
    return raw ? translateAcademicStudent(raw) : null;
  }
}
