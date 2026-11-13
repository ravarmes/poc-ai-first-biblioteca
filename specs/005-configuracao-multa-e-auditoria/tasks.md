# Tarefas: Tabela de Multa e Consulta da Auditoria

**Entrada**: [spec.md](spec.md) e [plan.md](plan.md)

## Fase 1: Contrato e Banco (bloqueante)

- [x] T001 Definir `contracts/openapi/paths/{config,audit}.yaml` e `0005_config.sql` / `0006_audit.sql`.

## Fase 2: Módulos `config` e `audit` (TDD)

- [x] T002 Implementar `FineRate`, `FineRateFacade`, `get-fine-rate`, `update-fine-rate` e testes de unidade (`[1.1]`–`[1.4]`).
- [x] T003 Implementar `packages/modules/audit` (`audit_reader`, filtros, cursor, `list-audit-events`) e testes (`[2.1]`–`[2.3]`).
- [x] T004 Escrever teste integrado entre `config`, `circulation` (`returnCopy`) e `audit` provando `[1.5]`.

## Fase 3: Frontend React e Verificação Final

- [x] T005 Implementar tela `/configuracoes-auditoria` com editor de multa, componente reutilizável `VersionConflictBanner` e tabela filtrável de `audit.events` (`[2.4]`).
- [x] T006 Rodar todos os portões (`docs:check`, `contract:lint`, `typecheck`, `deps:check`, `test`, `mutation`, `build`).
