# ADR-0018: Runner de migrations especificado

- **Status**: Aceita (adaptada da SenseUp ADR-0023)
- **Data**: 2026-11-10

## Contexto e problema

Ferramentas opacas de ORM dificultam auditar DDL, roles e checksums exatos aplicados no banco.

## Decisão

Escrever migrations em **SQL puro versionado** (`contracts/db/migrations/NNNN_<descricao>.sql` em UTF-8 LF) e manter um runner especificado (`contracts/db/README.md`) implementado em `packages/core/src/db/migrator/`:

- Controle em `meta.schema_migrations` (`version`, `name`, `checksum` SHA-256, `applied_at`, `execution_ms`).
- Lock consultivo durante execução (`pg_advisory_lock` quando em PostgreSQL TCP).
- Rejeição automática se um arquivo já aplicado mudar de checksum ou desaparecer, ou se surgir migration fora de ordem.
- Cada arquivo é imutável após versionado; alterações futuras seguem expandir → migrar → contrair.

## Consequências

- Positivas: total previsibilidade entre PostgreSQL 18 real e execução local de testes (PGlite).
- Negativas: desenvolvedores e agentes escrevem SQL explícito para evoluções de esquema.
