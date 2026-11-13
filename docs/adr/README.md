# Registros de Decisão Arquitetural (ADRs)

Conjunto de decisões do projeto **PoC AI-First Biblioteca Universitária** em formato MADR.

- **ADRs `0001`–`0008`**: decisões de fundação da biblioteca definidas no **Encontro 1 (slide 7)** — incluindo o histórico da substituição de SMS por e-mail (`0004` → `0008`).
- **ADRs `0009`–`0030`**: adaptações diretas dos padrões arquiteturais e AI-First do repositório de referência (`poc-ai-first-senseup-main/docs/adr/README.md`) para a stack única **Node.js + TypeScript (Hono)** e **React**.

## Índice consolidado

### Bloco 1 — Decisões de Fundação da Biblioteca (Encontro 1)

| Número | Decisão | Status | Módulo(s) / Área |
|---|---|---|---|
| [0001](0001-registrar-decisoes.md) | Registrar decisões arquiteturais em Markdown no repositório | Aceita | Governança / `docs/adr/` |
| [0002](0002-login-da-universidade.md) | Autenticação integrada ao login da universidade (OIDC + sessão local) | Aceita | Autenticação / `core` |
| [0003](0003-banco-postgresql.md) | Banco relacional PostgreSQL 18 único com fronteira lógica | Aceita | Dados / Infra |
| [0004](0004-aviso-por-sms.md) | Envio inicial de avisos de reserva por SMS | **Substituída pela [ADR-0008](0008-aviso-por-email.md)** | `notices` |
| [0005](0005-busca-no-proprio-banco.md) | Busca textual no próprio banco PostgreSQL do Acervo (RNF ≤ 1 s) | Aceita | `catalog` |
| [0006](0006-codigo-de-barras.md) | Identificação física de exemplares por código de barras único | Aceita | `circulation` |
| [0007](0007-multa-em-tabela.md) | Valor diário da multa em tabela configurável e auditada | Aceita | `config`, `circulation`, `audit` |
| [0008](0008-aviso-por-email.md) | Avisos de exemplar reservado disponíveis por e-mail (idempotente) | Aceita (substitui [ADR-0004](0004-aviso-por-sms.md)) | `notices` |

### Bloco 2 — Arquitetura Modular, Banco, API e Frontend (Padrões da PoC)

| Número | Decisão | Status | Módulo(s) / Área |
|---|---|---|---|
| [0009](0009-monolito-modular-com-extracao-provada.md) | Monólito modular com `MODULES=*` e fachadas substituíveis | Aceita | Todo o backend |
| [0010](0010-papeis-e-permissoes.md) | Modelo de papéis (`librarian`, `student`) e política centralizada | Aceita | `core`, módulos |
| [0011](0011-sessao-e-contexto-de-autenticacao.md) | Sessão HTTP em cookie com anti-CSRF e modo bearer/dev local | Aceita | `core`, `api-node`, `web-react` |
| [0012](0012-auditoria-versus-telemetria.md) | Separação estrita entre auditoria de negócio e telemetria operacional | Aceita | `core`, `audit` |
| [0013](0013-captura-atomica-da-auditoria-no-mediador.md) | Mediador de casos de uso grava auditoria na mesma transação | Aceita | `core`, todos os módulos |
| [0014](0014-contrato-openapi-zod-e-rfc9457.md) | Contrato OpenAPI 3.1.1 primeiro, validação estrita Zod e erros RFC 9457 | Aceita | `contracts/openapi`, `contract` |
| [0015](0015-estrutura-do-modulo-fatias-verticais-hibridas.md) | Módulos com fatias verticais híbridas (`public/`, `domain/`, `infrastructure/`, `slices/`) | Aceita | `packages/modules/*` |
| [0016](0016-fronteira-no-banco-schema-e-role-por-modulo.md) | Fronteira física no banco: um schema e uma role `NOLOGIN` por módulo | Aceita | `contracts/db`, `core` |
| [0017](0017-distribuicao-de-dados-entre-schemas.md) | Distribuição de tabelas entre `catalog`, `circulation`, `notices`, `config` e `audit` | Aceita | `contracts/db` |
| [0018](0018-runner-de-migrations-especificado.md) | Runner especificado de migrations SQL em UTF-8, checksum SHA-256 e lock consultivo | Aceita | `contracts/db`, `core` |
| [0019](0019-organizacao-das-specs-por-capacidade-e-historias.md) | Organização das specs: capacidade → história por caso de uso → critério `[n.n]` | Aceita | `specs/`, SDD |
| [0020](0020-paginacao-por-cursor-e-convencoes-da-api.md) | Paginação opaca por cursor (`limit`, `cursor`, `nextCursor`) e convenções HTTP | Aceita | `contracts/openapi`, `core` |
| [0021](0021-concorrencia-otimista-version-no-corpo.md) | Controle otimista com `version` no corpo e resposta `409 version-conflict` | Aceita | `catalog`, `circulation`, `config` |
| [0022](0022-acesso-a-dados-kysely-e-postgres-local.md) | Acesso a dados via Kysely com driver PostgreSQL 18 (`pg`) e runtime embutido `PGlite` | Aceita | `core`, `infrastructure` |
| [0023](0023-integracoes-externas-acl-secretaria-e-conformista-calendario.md) | Fronteiras externas: ACL para Secretaria e Conformista para Calendário | Aceita | `circulation` |
| [0024](0024-eventos-de-dominio-e-avisos-idempotentes.md) | Evento `CopyReturned` v1 pós-commit e despacho idempotente por `idempotencyKey` | Aceita | `circulation`, `notices` |
| [0025](0025-objetos-de-valor-agregados-e-maquina-de-estados.md) | Objetos de valor validados na borda do domínio e invariantes nos agregados | Aceita | `catalog`, `circulation` |
| [0026](0026-stack-nodejs-typescript-hono-e-ferramental.md) | Stack Node.js 22+, TypeScript estrito, Hono e `@hono/node-server` | Aceita | `apps/api-node`, `packages/` |
| [0027](0027-frontend-react-tanstack-shadcn-e-msw.md) | Frontend React 19, Vite, Tailwind, componentes acessíveis, TanStack, i18next `pt-BR` e MSW | Aceita | `apps/web-react` |
| [0028](0028-disciplina-de-testes-criterios-e-mutacao-stryker.md) | Pirâmide de testes ligada a `[n.n]`, limites extremos e mutação ≥ 80% no Stryker | Aceita | Todo o repositório |
| [0029](0029-fluxo-spec-kit-e-governanca-ai-first.md) | Fluxo Spec Kit adaptado, revisão por risco e verificação de fronteiras e docs | Aceita | `specs/`, `tools/`, `AGENTS.md` |
| [0030](0030-idioma-dos-identificadores-e-documentacao.md) | Código e contrato em inglês (com exceção da ACL crua); documentação, UI e testes em `pt-BR` | Aceita | Todo o repositório |
