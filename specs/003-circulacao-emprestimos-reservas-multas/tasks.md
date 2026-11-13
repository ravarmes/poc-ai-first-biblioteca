# Tarefas: Circulação — Empréstimos, Devoluções, Reservas e Multas

**Entrada**: [spec.md](spec.md) e [plan.md](plan.md)

## Fase 1: Contrato e Banco (bloqueante)

- [x] T001 Definir endpoints e esquemas em `contracts/openapi/paths/circulation.yaml`.
- [x] T002 Definir tabelas e índices em `contracts/db/migrations/0003_circulation.sql`.

## Fase 2: Domínio Puro e Adaptadores de Borda (TDD)

- [x] T003 Implementar VOs (`Barcode`, `StudentRegistration`, `Money`, `Email`) e `calendar.ts` (`computeDueDate`, `countOverdueDays`) + testes de unidade.
- [x] T004 Implementar agregados/entidades (`Copy`, `Loan`, `Fine`, `Hold`, `Student`) e portas + `domain/circulation-domain.test.ts` cobrindo `RN-01`..`RN-08`.
- [x] T005 Implementar ACL `academic-translator.ts`, Conformista `calendar-client.ts`, `InMemoryCirculationRepository` e `KyselyCirculationRepository`.

## Fase 3: Fatias Verticais e Testes

- [x] T006 Implementar `register-copy`, `retire-copy`, `list-copies`, `work-availability` (`[5.1]`, `[5.2]`).
- [x] T007 Implementar `lend-copy` (`[1.1]`–`[1.6]`) e `renew-loan` (`[4.1]`–`[4.4]`).
- [x] T008 Implementar `return-copy` com cálculo de multa na mesma tx, promoção FIFO de reserva e `afterCommit` `CopyReturned` v1 (`[2.1]`–`[2.4]`).
- [x] T009 Implementar `place-hold`, `withdraw-reserved-copy`, `expire-hold`, `pay-fine`, `get-student-summary` (`[3.1]`–`[3.4]`, `[5.3]`, `[5.4]`).
- [x] T010 Criar suíte de integração PostgreSQL (PGlite) e testes HTTP E2E de todos os critérios `[1.1]`–`[5.4]`.

## Fase 4: Frontend React e Verificação

- [x] T011 Implementar telas React `/balcao` e `/meus-emprestimos` e fluxo de reservar no `/catalogo` (`[5.5]`).
- [x] T012 Rodar Stryker mutation testing em `packages/modules/circulation/domain/` exigindo score ≥ 80%.
