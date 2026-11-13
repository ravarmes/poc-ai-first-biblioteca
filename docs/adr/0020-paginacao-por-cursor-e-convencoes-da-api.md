# ADR-0020: Paginação por cursor e convenções do contrato HTTP

- **Status**: Aceita (adaptada da SenseUp ADR-0024)
- **Data**: 2026-11-10

## Contexto e problema

Listagens com `offset` degradam em páginas grandes e pulam itens sob inserções concorrentes.

## Decisão

- Prefixo único `/api/v1/...` e health checks em `/health/live` e `/health/ready`.
- JSON sempre em `camelCase`; datas ISO-8601 em UTC (`...Z`); IDs em UUIDv7 (ordenáveis no tempo).
- Todas as listagens (obras do acervo, exemplares, avisos, eventos de auditoria) retornam `{ items: T[], nextCursor: string | null }` paginado por cursor opaco em Base64URL (`{ sort, id }`), validando forma canônica e retornando `400 validation-error` em `cursor` malformado ou `limit` fora de `[1..100]`.
- Valores monetários (multas e tarifa diária) trafegam como inteiro em centavos (`amountCents`, `dailyRateCents`) para evitar erros de arredondamento IEEE-754.

## Consequências

- Positivas: paginação estável, rápida e segura contra manipulação de cursor.
- Negativas: não oferece salto direto para "página 7", apenas avanço incremental ("Carregar mais").
