# Tarefas: Esqueleto, Sessão Universitária e Saúde do Serviço

**Entrada**: [spec.md](spec.md) e [plan.md](plan.md)

## Fase 1: Contrato e Banco (bloqueante)

- [x] T001 Especificar `/health/*`, `/api/v1/auth/*` e esquemas RFC 9457 em `contracts/openapi/`.
- [x] T002 Criar `contracts/db/migrations/0001_roles_and_schemas.sql` e `0006_audit.sql` + `contracts/db/README.md`.

## Fase 2: Núcleo e Testes de Aceite

- [x] T003 Implementar `packages/contract` e `packages/core` (`ids`, `mediator`, `http/problems`, `db/unit-of-work`, `db/migrator`, `audit`, `auth`).
- [x] T004 Criar testes do runner de migrations e isolamento de roles em PostgreSQL (`PGlite`), cobrindo `checksum`, idempotência e `permission denied`.
- [x] T005 Criar testes E2E HTTP de `[1.1]`–`[2.5]` (saúde, login, `/api/v1/auth/me`, CSRF, logout).

## Fase 3: API e Composição

- [x] T006 Implementar `apps/api-node` (`composition.ts`, `app.ts`, rotas `health` e `auth`, `seed.ts` com bibliotecária e alunos).

## Fase 4: Frontend React e Verificação

- [x] T007 Implementar shell `apps/web-react` (`i18next pt-BR`, `http.ts` com `X-CSRF-Token`, tela de login e seletor rápido de perfil cobrindo `[2.6]`).
- [x] T008 Rodar `docs:check`, `contract:lint`, `typecheck`, `deps:check` e testes da spec `001`.
