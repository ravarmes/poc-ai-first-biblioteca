# ADR-0016: Fronteira no banco — schema e role por módulo

- **Status**: Aceita (adaptada da SenseUp ADR-0020)
- **Data**: 2026-11-10

## Contexto e problema

Limitar acesso entre módulos apenas por regras de lint deixa o banco aberto: qualquer query ad hoc num repositório poderia fazer `JOIN` entre tabelas de `catalog` e `circulation`.

## Decisão

No PostgreSQL:

- Cada módulo possui um **schema** próprio (`catalog`, `circulation`, `notices`, `config`, `audit`) e uma **role `NOLOGIN`** dedicada (`mod_catalog`, `mod_circulation`, `mod_notices`, `mod_config`, `audit_reader`).
- A role de conexão da aplicação (`app`) é `LOGIN NOINHERIT`, sem permissões diretas em tabelas.
- Toda transação na `UnitOfWork` inicia com `SELECT set_config('search_path', $1, true), set_config('role', $2, true)`, vestindo a role do módulo apenas até o fim da transação (`LOCAL`).
- Todas as roles de escrita recebem apenas `USAGE` e `INSERT` em `audit.events`; somente `audit_reader` possui `SELECT` em `audit.events`. Nenhuma role de módulo possui `UPDATE` ou `DELETE` na auditoria.

## Consequências

- Positivas: vazamento de query cruzada falha no próprio PostgreSQL com erro de permissão.
- Negativas: chamada entre módulos precisa ocorrer em unidade de trabalho separada (executada no estágio `prepare` ou após o `COMMIT`), sem chave estrangeira inter-schemas.
