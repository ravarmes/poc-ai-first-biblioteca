# Plano de Implementação: Acervo e Catálogo Bibliográfico

**Spec**: [spec.md](spec.md)
**Status**: Implementado

## 1. Resumo técnico e aderência à Constituição

- **Contratos**: `contracts/openapi/paths/catalog.yaml`, `contracts/internal/facades.yaml`, `contracts/db/migrations/0002_catalog.sql`.
- **ADRs aplicadas**: ADR-0005 (busca no próprio PostgreSQL), ADR-0009/0015 (fachada + modo split HTTP), ADR-0016 (`mod_catalog` / schema `catalog`), ADR-0020 (cursor opaco), ADR-0021 (`version`), ADR-0025 (VO `Isbn`), ADR-0028 (mutação Stryker ≥ 80%).

## 2. Estrutura no monorepo e fronteiras

```text
packages/modules/catalog/
├─ package.json                exports apenas ./public e ./module
├─ public/
│  └─ index.ts                 CatalogFacade, createInProcessCatalogFacade e CatalogHttpClient (/internal/v1/catalog/*)
├─ domain/
│  ├─ work.ts                  Isbn, WorkTitle, entidade Work
│  ├─ work.test.ts             Testes de unidade de Work/Isbn/WorkTitle
│  └─ work-repository.ts       Porta WorkRepository e CATALOG_SCOPE
├─ infrastructure/
│  ├─ kysely-work-repository.ts
│  └─ in-memory-work-repository.ts
├─ slices/
│  ├─ create-work/             endpoint + command + handler
│  ├─ update-work/             endpoint + command + handler
│  ├─ get-work/                endpoint + query + handler
│  └─ search-works/            endpoint + query + handler
└─ module.ts                   rotas públicas e /internal/v1/catalog/*
```

**Regra de dependência**: `catalog` não importa nenhum outro módulo de negócio; importa apenas `@biblioteca/core` e `@biblioteca/contract`.

## 3. Estratégia de testes (Pirâmide + Mutação)

- `domain/work.test.ts`: validação matemática do dígito verificador de ISBN-10 (incluindo `X`) e ISBN-13, limites 1..200 de título, normalização e idempotência no `edit()` (`[1.1]`, `[1.2]`, `[1.5]`).
- `slices/catalog-slices.test.ts`: handlers em memória com `[1.3]` (`isbn-taken`), `[1.4]`, `[1.5]` (`version-conflict`), `[2.1]`–`[2.4]`.
- `infrastructure/catalog.integration.test.ts`: SQL real em PGlite verificando índice de busca textual, cursor e tempo p95 em 1.000 obras (`[2.5]`, `CS-001`).
- React + MSW em `apps/web-react`: tela de catálogo cobrindo `[2.6]`.
