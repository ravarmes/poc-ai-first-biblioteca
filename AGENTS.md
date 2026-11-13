# PoC AI-First Biblioteca Universitária — orientações para o agente

Este repositório implementa a versão do domínio da **biblioteca universitária** seguindo os padrões arquiteturais e de processo do repositório irmão `poc-ai-first-senseup-main` (`../poc-ai-first-senseup-main/`) sobre stack única **Node.js + TypeScript** (backend Hono) e **React** (frontend). Leia antes de propor ou editar qualquer arquivo.

## Visão do sistema

- **Objetivo**: materializar de ponta a ponta os conceitos dos quatro encontros do treinamento de engenharia de software (DDD estratégico, DDD tático + Arquitetura Limpa, Monólito Modular + Fatias Verticais + SDD, TDD + Mutação), mantendo fidelidade aos padrões da PoC da SenseUp sem multiplicar stacks (sem Go, .NET ou Blazor).
- **Módulos de negócio** (`packages/modules/`):
  - `catalog` (**Acervo**, subdomínio de suporte): obras (`Work`), busca no catálogo em ≤ 1 s e fachada pública `CatalogFacade`.
  - `circulation` (**Circulação**, subdomínio principal): exemplares (`Copy` com código de barras e máquina de estados), contas/alunos (`Student`), empréstimos (`Loan`), multas (`Fine`), fila de reservas (`Hold`), serviços de domínio (`computeDueDate`, `calculateOverdueFine`, `canBorrow`) e integrações externas (`Secretaria` via ACL, `Calendário` via Conformista).
  - `notices` (**Avisos**, subdomínio de suporte): reage ao evento `CopyReturned` e envia notificações idempotentes por `idempotencyKey`.
  - `config` (tabela configurável do valor diário da multa, ADR-0007): valor em centavos com controle otimista `version` e auditoria automática de alterações.
  - `audit` (auditoria transversal): consulta somente leitura em `audit.events` (gravação atômica via mediador em `packages/core`).
- **Núcleo transversal** (`packages/core/`): mediador com pipeline (`rastreamento → autorização → preparo → unidade de trabalho → auditoria`), problemas RFC 9457, paginação por cursor opaco, executor SQL/migrations Kysely (`pg` + suporte em memória/PGlite para testes locais), utilitários de domínio/eventos e apoios de teste (`packages/core/src/testing`).
- **Contrato único** (`contracts/` + `packages/contract/`): OpenAPI 3.1.1 + SQL PostgreSQL 18 com schema e role por módulo.
- **Aplicações** (`apps/`): `api-node` (composição modular por `MODULES=*` ou subconjunto, adaptador em processo ou HTTP entre módulos) e `web-react` (React 19, Vite, Tailwind, componentes acessíveis estilo shadcn, TanStack Router/Query/Form, i18next `pt-BR`, MSW nos testes).

## Oito regras operacionais

1. **Testes de aceite e critérios `[n.n]`**: todo critério `[n.n]` de `specs/*/spec.md` tem teste correspondente; um agente implementador não enfraquece nem apaga critérios de aceite. Correções de ambiguidade na spec exigem registro explícito na própria spec e no plano.
2. **Nada gerado se edita à mão**: código gerado a partir de contrato (quando aplicável em `*/generated/`) nunca é editado manualmente; altera-se o YAML em `contracts/` primeiro.
3. **Migration aplicada é imutável**: nunca alterar uma migration já versionada para mudar schema em uso; use o padrão expandir/contrair em nova migration numerada.
4. **Fronteiras de módulo no código e no banco**:
   - Um módulo só conversa com outro pelo `public/` dele (interface + DTOs + cliente HTTP opcional), nunca importando `domain/`, `infrastructure/` ou `slices/`. Verificado por `.dependency-cruiser.cjs` e `"exports"` em `package.json`.
   - `packages/core` não conhece nenhum módulo (`catalog`, `circulation`, `notices`, `config`, `audit`).
   - Código de produção não importa código de teste ou `packages/core/src/testing`.
   - No banco, cada módulo tem seu próprio `schema` e `role` (`mod_catalog`, `mod_circulation`, `mod_notices`, `mod_config`, `audit_reader`), sem `FOREIGN KEY` entre schemas diferentes (referência apenas por ID).
5. **Contrato antes do código**: toda mudança de rota, payload, problema RFC 9457 ou tabela começa por `contracts/openapi/` ou `contracts/db/`.
6. **Zonas sensíveis**: alterações em `contracts/openapi/`, `contracts/db/migrations/` e regras de autorização exigem revisão cuidadosa de contrato e impactos antes de implementar.
7. **Idioma dos identificadores (ADR-0030 / ref. SenseUp ADR-0052)**:
   - Código (classes, métodos, funções, variáveis, tipos, arquivos, pastas, rotas da API, campos JSON, tabelas/colunas SQL, eventos de domínio e códigos `/problems/...`): sempre em **inglês** (`Work`, `Copy`, `Student`, `Loan`, `Fine`, `Hold`, `lendCopy`, `returnCopy`, `CopyReturned`, `/problems/pending-fine`).
   - **Exceção explícita da camada anticorrupção (ACL)**: os tipos crus recebidos dos sistemas externos na borda (`discente`, `nome_civil`, `sit_matricula`, `cod_curso` da Secretaria; `dias_letivos` do Calendário) mantêm os nomes originais do fornecedor exclusivamente dentro do módulo adaptador/tradutor (`infrastructure/secretaria-*`, `infrastructure/calendar-*`).
   - Documentação, especificações (`specs/`), ADRs, comentários no código, textos de interface (`pt-BR.json`), detalhes de `ProblemError` e descrições de `test(...)` / `describe(...)`: em **português (`pt-BR`)**.
8. **Qualidade antes de concluir**: `npm run docs:check`, `npm run contract:lint`, `npm run typecheck`, `npm run deps:check`, `npm test`, `npm run mutation` (nota ≥ 80% em domínio e fatias) e `npm run build` devem passar com evidência real registrada.

## Glossário da Linguagem Ubíqua (por contexto)

| Conceito (pt-BR) | Contexto | Identificador no código (EN) | Observação |
|---|---|---|---|
| Obra | `catalog` | `Work`, `WorkTitle`, `Isbn` | Unidade bibliográfica catalogada (título, autores, assunto, ISBN) |
| Exemplar | `circulation` | `Copy`, `Barcode`, `CopyStatus` | Cópia física na estante; referencia `Work` apenas por `workId` |
| Aluno (balcão) | `circulation` | `Student`, `StudentRegistration` | Raiz de agregado com empréstimos em aberto, multas e versão otimista |
| Discente (origem) | `Secretaria` (ACL) | `RawAcademicRecord` (`discente`) | Formato externo traduzido na borda por `academic-translator.ts` |
| Empréstimo | `circulation` | `Loan`, `lendCopy` | Entidade filha de `Student`; vincula `copyId`, prazo e devolução |
| Multa | `circulation` | `Fine`, `Money`, `payFine` | Valor em centavos (`amountCents`), calculado na mesma transação da devolução |
| Reserva / Fila | `circulation` | `Hold`, `HoldStatus`, `placeHold`, `withdrawReservedCopy` | Reserva vinculada a um `workId`; janela de retirada de 3 dias após retorno |
| Tabela de multa | `config` | `FineRateConfig`, `dailyRateCents` | Padrão 100 centavos (R$ 1,00/dia); alterações auditadas |
| Aviso | `notices` | `NoticeDispatch`, `idempotencyKey`, `CopyReturned` | Envio único de e-mail por `idempotencyKey` ao retornar exemplar reservado |
| Dia letivo | `Calendário` | `SchoolCalendar`, `computeDueDate` | Relação Conformista: consome `{ dias_letivos }` direto no serviço de domínio |

## Fontes principais

- Constituição: [`docs/constitution.md`](docs/constitution.md)
- Modelo estratégico e vocabulário: [`docs/dominio.md`](docs/dominio.md)
- Arquitetura: [`docs/architecture.md`](docs/architecture.md) e [`docs/architecture.html`](docs/architecture.html)
- Decisões arquiteturais: [`docs/adr/README.md`](docs/adr/README.md)
- Divisão e guia das specs: [`specs/README.md`](specs/README.md)
- Mapa e comandos do projeto: [`README.md`](README.md)
