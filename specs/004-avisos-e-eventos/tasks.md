# Tarefas: Avisos por E-mail e Eventos de Domínio

**Entrada**: [spec.md](spec.md) e [plan.md](plan.md)

## Fase 1: Contrato e Banco (bloqueante)

- [x] T001 Definir `contracts/openapi/paths/notices.yaml` e `contracts/db/migrations/0004_notices.sql`.

## Fase 2: Domínio, Adaptadores e Fatias (TDD)

- [x] T002 Definir esquema `CopyReturnedEventV1` em `packages/contract`.
- [x] T003 Implementar `packages/modules/notices/domain/notice.ts`, `notice-ports.ts` e `notice.test.ts` (`res-<holdId>`).
- [x] T004 Implementar `KyselyNoticeRepository` (`ON CONFLICT DO NOTHING`), `InMemoryNoticeRepository` e `InMemoryEmailSender` em `infrastructure/notice-adapters.ts`.
- [x] T005 Implementar fatias `dispatch-notice` e `list-notices` + `NoticesFacade` em `public/index.ts`.

## Fase 3: Integração e Frontend

- [x] T006 Escrever testes de concorrência SQL no PGlite (`CS-001`) e aceite HTTP/pós-commit (`[1.1]`–`[2.2]`).
- [x] T007 Exibir seção de Avisos em `/meus-emprestimos` e `/balcao` em `apps/web-react`.
