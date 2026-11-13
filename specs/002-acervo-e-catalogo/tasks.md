# Tarefas: Acervo e Catálogo Bibliográfico

**Entrada**: [spec.md](spec.md) e [plan.md](plan.md)

## Fase 1: Contrato e Banco (bloqueante)

- [x] T001 Definir `contracts/openapi/paths/catalog.yaml`, `contracts/internal/facades.yaml` e `contracts/db/migrations/0002_catalog.sql`.

## Fase 2: Domínio e Testes (TDD)

- [x] T002 Implementar VOs (`Isbn`, `WorkTitle`) e entidade `Work` em `packages/modules/catalog/domain/work.ts` + `work.test.ts` citando `[1.1]`, `[1.2]`, `[1.5]`.
- [x] T003 Implementar `WorkRepository` (`domain/work-repository.ts`) em memória e Kysely PostgreSQL (`search`, cursor `id DESC`, conflito `23505` em `isbn` e `WHERE version = $n`).

## Fase 3: Fatias Verticais, Fachada e Rotas Internas

- [x] T004 Implementar fatias `create-work`, `update-work`, `get-work`, `search-works` e `module.ts` com rotas públicas e `/internal/v1/catalog/*`.
- [x] T005 Implementar `CatalogHttpClient` em `public/index.ts`.
- [x] T006 Escrever testes de fatia, integração SQL (incluindo medição de 1.000 obras para `[2.5]`) e aceite HTTP para `[1.1]`–`[2.5]`.

## Fase 4: Frontend React e Verificação

- [x] T007 Construir página `/catalogo` e formulário de cadastro/edição de obra na UI React (`[2.6]`).
- [x] T008 Verificar `deps:check` (zero acesso interno a outros módulos) e cobertura Stryker ≥ 80% no domínio do catálogo.
