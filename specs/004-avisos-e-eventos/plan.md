# Plano de Implementação: Avisos por E-mail e Eventos de Domínio

**Spec**: [spec.md](spec.md)
**Status**: Implementado

## 1. Resumo técnico e aderência à Constituição

- **Contratos**: `contracts/openapi/paths/notices.yaml`, `contracts/db/migrations/0004_notices.sql`, esquema `CopyReturnedEventV1` em `@biblioteca/contract`.
- **ADRs aplicadas**: ADR-0004/0008 (e-mail, sem SMS), ADR-0016 (`mod_notices`, schema `notices`), ADR-0024 (evento pós-commit com `idempotencyKey = res-<holdId>`).

## 2. Estrutura no monorepo e fronteiras

```text
packages/modules/notices/
├─ package.json                    exports: ./public, ./module
├─ public/
│  └─ index.ts                     NoticesFacade { handleCopyReturned }
├─ domain/
│  ├─ notice.ts                    buildHoldReadyNotice, formatIdempotencyKey
│  ├─ notice.test.ts               testes de unidade de notices
│  └─ notice-ports.ts              NoticeRepository, EmailSenderPort e NOTICES_SCOPE
├─ infrastructure/
│  ├─ notice-adapters.ts           KyselyNoticeRepository (ON CONFLICT), InMemoryNoticeRepository e InMemoryEmailSender
│  └─ notices.integration.test.ts  testes de concorrência idempotente em PGlite
├─ slices/
│  ├─ dispatch-notice/             processa CopyReturned v1 em transação mod_notices
│  └─ list-notices/                consulta paginada com isolamento de papel (student vs librarian)
└─ module.ts
```

## 3. Estratégia de testes (Pirâmide + Mutação)

- `domain/notice.test.ts`: formato exato de `res-<holdId>`, validação de `schemaVersion === 1`, conteúdo do assunto e corpo em `pt-BR`.
- `slices/notices-slices.test.ts`: critérios `[1.1]`, `[1.2]`, `[2.1]`, `[2.2]`.
- `infrastructure/notices.integration.test.ts`: duas execuções concorrentes (`Promise.all`) no `PGlite` verificando que `ON CONFLICT (idempotency_key) DO NOTHING` garante apenas 1 e-mail enviado (`CS-001`).
- Integração com Circulação cobrindo `[1.3]` (rollback cancela aviso).
