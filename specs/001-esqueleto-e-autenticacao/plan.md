# Plano de Implementação: Esqueleto, Sessão Universitária e Saúde do Serviço

**Spec**: [spec.md](spec.md)
**Status**: Implementado

## 1. Resumo técnico e aderência à Constituição

- **Contratos**: `contracts/openapi/paths/health.yaml`, `contracts/openapi/paths/auth.yaml`, `contracts/db/migrations/0001_roles_and_schemas.sql` e `0006_audit.sql`.
- **ADRs aplicadas**: ADR-0002 (Login da Universidade), ADR-0010 (`librarian` e `student`), ADR-0011 (sessão em banco, cookies + CSRF e seletor de contas), ADR-0013 (auditoria no Mediador), ADR-0014 (OpenAPI + Zod estrito + RFC 9457), ADR-0016 (schemas + roles), ADR-0018 (runner de migrations), ADR-0022 (Kysely com `pg` e `PGlite`), ADR-0026 (Node + Hono), ADR-0027 (React 19 + TanStack).

## 2. Estrutura no monorepo e fronteiras

- **`packages/contract`**: enums de `ProblemType`, esquemas Zod estritos compartilhados (`LoginRequest`, `Principal`, etc.).
- **`packages/core`**:
  - `ids.ts`: gerador UUIDv7 compatível com PostgreSQL 17/18;
  - `http/problems.ts` & `http/middleware.ts`: `ProblemError`, `problemResponse`, `requestIdMiddleware`, `csrfAndAuthMiddleware`, `notFoundHandler`, `onErrorHandler`;
  - `mediator/mediator.ts`: pipeline `tracing -> authorize -> prepare -> unitOfWork -> audit -> afterCommit / compensate`;
  - `db/`: fábrica Kysely para PostgreSQL (`pg`) e `PGlite` embutido, `UnitOfWork` com `set_config('role', ...)` e `set_config('search_path', ...)`, runner `migrator/` com `pg_advisory_lock(20261110)` e SHA-256;
  - `audit/audit.ts`: escritor append-only em `audit.events`;
  - `auth/authenticator.ts`: criação, leitura e revogação de sessão em `auth.sessions` usando `mod_auth`.
- **`apps/api-node`**: servidor Hono montando `/health/*`, `/api/v1/auth/*` (`login`, `logout`, `dev-accounts`, `me`) e os módulos registrados via `MODULES=*`.
- **`apps/web-react`**: shell inicial com i18n `pt-BR`, cliente HTTP tipado com envio automático de `X-CSRF-Token`, página de login/seletor de perfis e navegação protegida por papel.

## 3. Estratégia de testes (Pirâmide + Mutação)

- **Domínio / Core**: validação estrita de `X-Request-Id`, UUIDv7, `ProblemError`, pipeline do Mediador (`prepare` fora da tx, rollback em exceção, `compensate` em falha de evento/pós-commit) -> cobre `[1.1]`..`[1.4]`.
- **Migrations & Isolamento SQL (PGlite real)**: aplicar `0001..0006`, verificar idempotência (`nada pendente`), adulteração de checksum (`checksum`), e provar `permission denied` quando `mod_circulation` tenta acessar `catalog.works` ou `auth.sessions`.
- **API HTTP**: suite cobrindo `[1.1]`..`[2.5]` ponta a ponta via Hono `app.request(...)` com PGlite real.
- **React + MSW**: login e troca de perfil cobrindo `[2.6]`.
