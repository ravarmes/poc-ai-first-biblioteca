# Fases de construção — PoC AI-First Biblioteca Universitária

Roteiro adaptado do `docs/fases.md` de `poc-ai-first-senseup-main` para uma única stack (**Node.js + TypeScript + React**) e escopo enxuto da biblioteca universitária.

## Fase 0 — Fundação documental, contratos e SDD

**Objetivo**: fechar modelo estratégico, decisões arquiteturais, arquitetura, contratos e especificações antes de escrever código de produto.

- Modelo estratégico em [`docs/dominio.md`](dominio.md): subdomínios, contextos delimitados, linguagem ubíqua, mapa de contexto e máquina de estados.
- ADRs `0001`–`0008` (históricas da biblioteca do Encontro 1) + `0009`–`0030` (arquitetura PoC Node + React).
- Arquitetura documentada em [`docs/architecture.md`](architecture.md), [`docs/architecture.html`](architecture.html) e `docs/architecture/`.
- Contratos OpenAPI 3.1.1 (`contracts/openapi/`) e SQL PostgreSQL 18 (`contracts/db/`).
- Specs `001` a `005` completas com `spec.md`, `plan.md` e `tasks.md`.

## Fase 1 — Monorepo, núcleo transversal (`packages/core`) e contratos executáveis

**Objetivo**: estabelecer o alicerce verificável antes das fatias de negócio.

- Workspaces npm (`packages/contract`, `packages/core`, `packages/modules/*`, `apps/api-node`, `apps/web-react`).
- Regras de fronteira em `.dependency-cruiser.cjs` + `package.json#exports`.
- Pacote `@biblioteca/contract`: esquemas Zod e catálogo de erros RFC 9457.
- Pacote `@biblioteca/core`: mediador (pipeline completo), UoW com `set_config(search_path, role)`, runner de migrations SQL especificado, paginação por cursor opaco, auditoria append-only e `testing/` fakes.

## Fase 2 — Esqueleto andante e Acervo (`specs/001` e `specs/002`)

**Objetivo**: subir API Node + Frontend React ponta a ponta com o primeiro módulo real.

- Rotas `/health/live`, `/health/ready`, login universitário local / sessão (`/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/dev-accounts`, `/api/v1/auth/me`) e papéis (`librarian`, `student`).
- Módulo `catalog` (`Work`, busca paginada ≤ 1 s, cadastro pela bibliotecária e fachada `CatalogFacade.work(id)`).
- Front React inicial com shell autenticado, busca no catálogo e testes Vitest + MSW.

## Fase 3 — Circulação (Core), Avisos e Configuração/Auditoria (`specs/003`, `004`, `005`)

**Objetivo**: entregar todo o coração da biblioteca e as integrações de borda.

- `circulation`: `Copy` (código de barras + estados), `Student` (invariantes RN-01/RN-02 + `version`), `Loan`, `Fine`, `Hold`, serviços puros `computeDueDate` (Conformista `Calendário`, 14 dias letivos) e `calculateOverdueFine`, ACL `Secretaria` (`academic-translator.ts`), fatias `lendCopy`, `returnCopy`, `renewLoan`, `placeHold`, `withdrawReservedCopy`, `expireHold`, `payFine`, `registerCopy`, consultas do aluno e do balcão.
- `notices`: assinatura de `CopyReturned` v1 + `EmailSender` com garantia de idempotência por `idempotencyKey`.
- `config` & `audit`: valor diário da multa em tabela (ADR-0007) com auditoria automática + API/UI de consulta da trilha `audit.events`.
- Telas React completas para **Aluno** (Catálogo, Meus Empréstimos/Multas/Reservas/Avisos) e **Bibliotecária** (Balcão: Emprestar, Devolver, Retirar Reserva, Quitar Multa, Acervo & Exemplares, Tabela de Multa, Auditoria).

## Fase 4 — Qualidade, mutação, fronteiras SQL e prova de extração (`MODULES`)

**Objetivo**: provar cada guardrail em execução real.

- Portões verdes: `docs:check`, `contract:lint`, `typecheck`, `deps:check`, `build`.
- Testes contra migrations reais PostgreSQL (PGlite / PG 18): checksum, idempotência de migration, `SET ROLE` e recusa de acesso cruzado entre schemas, corrida de `version-conflict` (`409`).
- Nota de mutação ≥ 80% no Stryker sobre domínio e fatias.
- Teste de modo modular seletivo (`MODULES=catalog`, `MODULES=circulation` falando via adaptador HTTP interno `/internal/v1/...` de `CatalogFacade`), provando que a fronteira de módulo é substituível sem alterar regras de negócio.
- Revisão final independente seguindo `revisor-codigo`.
