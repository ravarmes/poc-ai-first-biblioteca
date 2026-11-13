# Migrations e runner especificado

> Contrato do banco da PoC Biblioteca Universitária ([ADR-0016](../../docs/adr/0016-fronteira-no-banco-schema-e-role-por-modulo.md), [ADR-0017](../../docs/adr/0017-distribuicao-de-dados-entre-schemas.md), [ADR-0018](../../docs/adr/0018-runner-de-migrations-especificado.md)).

## 1. Estrutura

```text
contracts/db/
├─ migrations/
│  ├─ 0001_roles_and_schemas.sql
│  ├─ 0002_catalog.sql
│  ├─ 0003_circulation.sql
│  ├─ 0004_notices.sql
│  ├─ 0005_config.sql
│  └─ 0006_audit.sql
└─ README.md
```

- `NNNN` tem quatro dígitos e define a ordem (`0001` a `9999`). A **versão** é `NNNN` e o **nome** é o trecho após `_`, sem `.sql`.
- Duas migrations com a mesma versão geram erro explícito antes de tocar o banco.
- Arquivos em UTF-8 com LF; o checksum é o **SHA-256** hexadecimal minúsculo dos bytes exatos do arquivo.
- **Migration já aplicada é imutável.** Alterações de esquema seguem expandir -> migrar código -> contrair.
- Nomes são qualificados com o schema (`catalog.works`, `circulation.loans`, `notices.dispatches`, `config.fine_rates`, `audit.events`).

## 2. Schemas e roles

| Módulo / Uso | Role (`NOLOGIN`) | Schema | Privilégios |
|---|---|---|---|
| Autenticação local (`packages/core` / auth) | `mod_auth` | `auth` | `SELECT, INSERT, UPDATE, DELETE` em `auth.*` |
| Acervo (`packages/modules/catalog`) | `mod_catalog` | `catalog` | `SELECT, INSERT, UPDATE` em `catalog.works` + `INSERT` em `audit.events` |
| Circulação (`packages/modules/circulation`) | `mod_circulation` | `circulation` | `SELECT, INSERT, UPDATE` nas 5 tabelas de `circulation.*` + `INSERT` em `audit.events` |
| Avisos (`packages/modules/notices`) | `mod_notices` | `notices` | `SELECT, INSERT` em `notices.dispatches` + `INSERT` em `audit.events` |
| Configuração (`packages/modules/config`) | `mod_config` | `config` | `SELECT, INSERT, UPDATE` em `config.fine_rates` + `INSERT` em `audit.events` |
| Leitura da auditoria (`packages/modules/audit`) | `audit_reader` | `audit` | Somente `SELECT` em `audit.events` |

A aplicação executa com uma identidade base sem permissões diretas (`app`, `NOINHERIT`) e, a cada `UnitOfWork`, veste a role do módulo com `SELECT set_config('role', '<role>', true), set_config('search_path', '<schema>, public', true)`.

## 3. Tabela de controle (`meta.schema_migrations`)

```sql
CREATE TABLE IF NOT EXISTS meta.schema_migrations (
  version      text        PRIMARY KEY,
  name         text        NOT NULL,
  checksum     text        NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  execution_ms integer     NOT NULL
);
```

## 4. Algoritmo do runner (`migrate` e `status`)

1. Adquire trava consultiva de sessão `SELECT pg_advisory_lock(20261110)` (em PostgreSQL em rede; em `PGlite` em processo único, também é válida na sessão).
2. Garante `CREATE SCHEMA IF NOT EXISTS meta` e `meta.schema_migrations`.
3. Lê `contracts/db/migrations/*.sql` em ordem crescente e lê `meta.schema_migrations`:
   - toda versão já aplicada precisa existir no disco com o **mesmo checksum** (senão falha citando `checksum` ou `ausente`);
   - toda versão pendente precisa ser **maior** que a maior versão aplicada (senão falha com `fora de ordem`).
4. Para cada arquivo pendente, abre transação própria, aplica `set_config('search_path', 'public', true)` e `set_config('lock_timeout', '5s', true)`, executa o SQL completo, grava o registro em `meta.schema_migrations` e faz `COMMIT`. Em erro, executa `ROLLBACK` e libera a trava.
5. Libera `SELECT pg_advisory_unlock(20261110)` em bloco `finally`.

`statusJson()` não cria o schema `meta` nem altera o banco: devolve `{ applied, pending, errors }`.

## 5. Compatibilidade PostgreSQL 18 e PGlite

- Os `id` (`uuid PRIMARY KEY`) são UUIDv7 gerados pela aplicação (`packages/core/src/ids.ts`), evitando dependência exclusiva da função `uuidv7()` do PostgreSQL 18 quando os testes e o modo embarcado rodam em `PGlite` (PostgreSQL 17 WASM).
- Nenhuma migration contém senhas ou credenciais literais (`AGENTS.md`, regra de segredos).
