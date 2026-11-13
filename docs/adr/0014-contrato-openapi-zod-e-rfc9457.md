# ADR-0014: Contrato OpenAPI 3.1.1 primeiro, Zod estrito e erros RFC 9457

- **Status**: Aceita (adaptada da SenseUp ADR-0018 e ADR-0024)
- **Data**: 2026-11-10

## Contexto e problema

Backend e frontend precisam concordar em URLs, schemas, validações de fronteira e formatos de erro sem divergência silenciosa.

## Decisão

1. **Fonte da verdade**: `contracts/openapi/openapi.yaml` (OpenAPI 3.1.1 modularizado em `components/` e `paths/`), validado por `@redocly/cli`.
2. **Validação estrita**: esquemas Zod em `@biblioteca/contract` espelham o contrato com `.strict()` nos corpos JSON, recusando campos desconhecidos com `400 /problems/validation-error` e mensagens em `pt-BR`.
3. **Erros RFC 9457**: toda resposta `4xx`/`5xx` usa `Content-Type: application/problem+json` com `{ type: "/problems/<codigo>", title, status, detail?, requestId?, errors?, currentVersion? }`.

## Consequências

- Positivas: cliente React e endpoints Hono compartilham tipos, códigos de problema e validações previsíveis.
- Negativas: qualquer novo campo exige atualização sincronizada em `contracts/openapi/` e `@biblioteca/contract`.
