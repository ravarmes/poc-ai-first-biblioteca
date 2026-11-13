# Plano de Implementação: Circulação — Empréstimos, Devoluções, Reservas e Multas

**Spec**: [spec.md](spec.md)
**Status**: Implementado

## 1. Resumo técnico e aderência à Constituição

- **Contratos**: `contracts/openapi/paths/circulation.yaml`, `contracts/db/migrations/0003_circulation.sql`.
- **ADRs aplicadas**: ADR-0006 (`Barcode`), ADR-0013 (auditoria atômica e `afterCommit`), ADR-0015 (fatias verticais híbridas), ADR-0016 (`mod_circulation`, sem FK cruzada), ADR-0017 (cópia local `circulation.students`), ADR-0021 (`version` + `409`), ADR-0023 (ACL Secretaria + Conformista Calendário), ADR-0024 (`CopyReturned` v1), ADR-0025 (VOs e máquina de estados).

## 2. Estrutura no monorepo e fronteiras

```text
packages/modules/circulation/
├─ package.json                   exports: ./public, ./module
├─ public/
│  └─ index.ts                    CirculationDeps, InMemoryAcademicRegistry, ConformistCalendarClient, ClockPort e portas
├─ domain/
│  ├─ value-objects.ts            Barcode, StudentRegistration, Money, Email, ClockPort
│  ├─ calendar.ts                 SchoolCalendar, computeDueDate, countOverdueDays (Conformista)
│  ├─ copy.ts                     Copy + estados (available | on-loan | reserved | retired)
│  ├─ loan.ts                     Loan + renew + close
│  ├─ fine.ts                     Fine + Money + pay
│  ├─ hold.ts                     Hold + assignCopy + fulfill + expire
│  ├─ student.ts                  Agregado Student (RN-01, RN-02, RN-03)
│  ├─ ports.ts                    Repositórios, AcademicRegistryPort, SchoolCalendarPort
│  └─ circulation-domain.test.ts Testes puros do domínio de circulação
├─ infrastructure/
│  ├─ academic-translator.ts      ACL (discente -> AcademicStudent)
│  ├─ calendar-client.ts          Conformista (dias_letivos)
│  ├─ kysely-circulation-repo.ts  Consultas SQL em circulation.*
│  ├─ in-memory-circulation-repo.ts
│  ├─ integrations.test.ts        Testes da ACL Secretaria e Conformista Calendário
│  └─ circulation.integration.test.ts Testes PGlite (constraints, concorrência e version-conflict)
├─ slices/
│  ├─ list-copies/
│  ├─ register-copy/
│  ├─ retire-copy/
│  ├─ work-availability/
│  ├─ lend-copy/
│  ├─ renew-loan/
│  ├─ return-copy/
│  ├─ place-hold/
│  ├─ withdraw-reserved-copy/
│  ├─ expire-hold/
│  ├─ pay-fine/
│  └─ get-student-summary/
└─ module.ts
```

## 3. Estratégia de testes (Pirâmide + Mutação)

- **Domínio puro** (`domain/*.test.ts`):
  - `Copy`: todas as transições válidas e proibidas (`[1.3]`, `[2.4]`, `[5.2]`).
  - `Student` + `Loan`: limite 3 empréstimos (`< 3` vs `=== 3` -> mutação!), bloqueio por multa pendente, bloqueio de renovação por reserva aguardando (`[1.2]`, `[1.4]`, `[4.2]`).
  - `calendar`: `computeDueDate` pulando finais de semana e feriados + `countOverdueDays` com limites (`0`, `1`, `3` dias).
- **Fatias em memória**: cobrir `[1.1]`..`[5.4]` incluindo falha injetada na gravação da multa provando rollback/ausência de `afterCommit`.
- **Integração PostgreSQL (PGlite)**: `UNIQUE loans_one_open_per_copy_idx`, `UNIQUE holds_one_active_per_student_work_idx`, `UNIQUE barcode`, concorrência de empréstimo paralelo (`[1.6]`), `version-conflict` (`[4.4]`).
- **API E2E + React**: cenários completos ponta a ponta (`[5.5]`).
