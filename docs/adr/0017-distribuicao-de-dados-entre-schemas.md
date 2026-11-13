# ADR-0017: Distribuição de dados entre schemas

- **Status**: Aceita (adaptada da SenseUp ADR-0006)
- **Data**: 2026-11-10

## Contexto e problema

O sistema da biblioteca não é multi-tenant como a plataforma SenseUp, mas precisa separar claramente os contextos delimitados em tabelas distintas.

## Decisão

Distribuir os dados em cinco schemas PostgreSQL sem chaves estrangeiras entre schemas distintos:

| Schema | Role com acesso | Tabelas |
|---|---|---|
| `catalog` | `mod_catalog` | `works` |
| `circulation` | `mod_circulation` | `students`, `copies`, `loans`, `fines`, `holds` |
| `notices` | `mod_notices` | `dispatches` (controle por `idempotency_key` único) |
| `config` | `mod_config` (escrita/leitura), leitura pela `FineRateFacade` | `fine_rates` |
| `audit` | Todos `INSERT`; leitura apenas `audit_reader` | `events` (append-only), além de `auth_accounts` em `public`/controle no escopo de login local quando aplicável ou tabela `config`/`identity` conforme migration |

> Nota: `copies.work_id`, `fines.daily_rate_cents` e `holds.work_id` guardam apenas o identificador/valor copiado por fronteira, consultando o módulo dono pelas fachadas públicas antes ou depois da transação.

## Consequências

- Positivas: extração de qualquer módulo para banco próprio no futuro exige zero quebra de chave estrangeira SQL.
- Negativas: existência de `workId` ou estado atualizado da obra requer verificação via `CatalogFacade` na fronteira.
