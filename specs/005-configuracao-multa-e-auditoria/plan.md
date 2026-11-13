# Plano de Implementação: Tabela de Multa e Consulta da Auditoria

**Spec**: [spec.md](spec.md)
**Status**: Implementado

## 1. Resumo técnico e aderência à Constituição

- **Contratos**: `contracts/openapi/paths/config.yaml`, `contracts/openapi/paths/audit.yaml`, `contracts/db/migrations/0005_config.sql` e `0006_audit.sql`.
- **ADRs aplicadas**: ADR-0007 (multa em tabela auditada), ADR-0012/0013 (auditoria append-only e filtros), ADR-0016 (`mod_config` e `audit_reader`), ADR-0020 (cursor), ADR-0021 (`version`).

## 2. Estrutura no monorepo e fronteiras

```text
packages/modules/config/
├─ package.json                   exports: ./public, ./module
├─ public/index.ts                FineRateFacade { currentDailyRateCents }
├─ domain/
│  ├─ fine-rate.ts               FineRate (1..100000 centavos, update com version e idempotência)
│  └─ fine-rate-repository.ts    porta FineRateRepository e CONFIG_SCOPE
├─ infrastructure/
│  └─ fine-rate-repository.ts    KyselyFineRateRepository + InMemoryFineRateRepository
├─ slices/{get-fine-rate,update-fine-rate}/
└─ module.ts

packages/modules/audit/
├─ package.json                   exports: ./module
├─ domain/audit-query.ts          validação de filtros e janela temporal (from < to)
├─ infrastructure/kysely-audit-reader.ts
├─ slices/list-audit-events/
└─ module.ts
```

## 3. Estratégia de testes (Pirâmide + Mutação)

- `domain/fine-rate.test.ts` + `audit-query.test.ts`: validação de limites, `before`/`after` diff e janela temporal.
- Integração SQL: prova de `audit_reader` bloqueada para escrita em `audit.events` e atualização atômica com `WHERE version = $n`.
- Aceite HTTP + fluxo React (`VersionConflict`): critérios `[1.1]`..`[2.4]`.
