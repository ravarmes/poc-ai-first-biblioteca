# ADR-0022: Acesso a dados com Kysely e modo PGlite/PostgreSQL 18

- **Status**: Aceita (adaptada da SenseUp ADR-0022 para ambiente Node local)
- **Data**: 2026-11-10

## Contexto e problema

Precisamos de acesso SQL tipado sem magia de ORM escondendo queries e transações (ADR-0003), além de capacidade de rodar toda a suíte SQL/migrations/roles localmente no Node mesmo sem Docker disponível.

## Decisão

- Usar **Kysely** para queries tipadas dentro de cada módulo e na `UnitOfWork` de `packages/core`.
- Em produção / banco dedicado, conectar ao **PostgreSQL 18** usando o driver padrão `pg` (`Pool`).
- Para testes automatizados e execução local autônoma (quando `DATABASE_URL` / Postgres TCP externo não estiver configurado), disponibilizar adaptador `Kysely` compatível sobre **`@electric-sql/pglite`** (PostgreSQL real em WASM executando os mesmos arquivos `.sql` de `contracts/db/migrations/`), mantendo as mesmas consultas, constraints `UNIQUE`, transações e verificação de permissões/roles.

## Consequências

- Positivas: 100% do SQL, migrations, triggers e schemas PostgreSQL reais são exercitados a cada `npm test` sem exigir container Docker rodando.
- Negativas: requer adaptador fino de dialeto Kysely + atenção a particularidades pontuais (ex.: advisory locks TCP vs lock em memória no modo single-process PGlite).
