# Especificação: Acervo e Catálogo Bibliográfico

**Pasta da fatia**: `specs/002-acervo-e-catalogo/`
**Data**: 2026-11-10
**Status**: Implementada
**Módulo(s)**: `catalog` (`packages/modules/catalog`) · schema `catalog` (`mod_catalog`)

## Cenários de uso e critérios de aceite *(obrigatório)*

### História 1 — Cadastrar e atualizar obras bibliográficas no catálogo (Prioridade: P1)

**Ator**: Bibliotecária (`librarian`)
**Fluxo principal (Cockpit)**:
1. A bibliotecária acessa o formulário de nova obra e informa título, autores (ao menos um), assunto e ISBN opcional.
2. O endpoint valida o corpo com esquema estrito (`CreateWorkRequest`) e envia ao Mediador.
3. O agregado `Work` normaliza os espaços nas pontas de título, assunto e autores, valida e normaliza o ISBN (ISBN-10 ou ISBN-13 com dígito verificador válido), e cria o registro com `version = 1`.
4. O handler persiste em `catalog.works` (role `mod_catalog`) e grava `work.created` em `audit.events` na mesma transação.
5. Para correção posterior (`PATCH /api/v1/catalog/works/{workId}`), exige a `version` atual, aplica somente os campos modificados, incrementa `version` em +1 e audita `work.updated` com `changes { campo: { before, after } }`.

**Fluxos alternativos / exceções**:
- **1a.** Usuário com papel `student` tenta cadastrar ou atualizar obra -> `403 /problems/forbidden`.
- **3a.** Título vazio/maior que 200 caracteres, lista de autores vazia, assunto vazio ou ISBN inválido -> `400 /problems/validation-error` apontando o campo.
- **4a.** Já existe obra com o mesmo ISBN normalizado -> `409 /problems/isbn-taken`.
- **5a.** Edição com `version` defasada -> `409 /problems/version-conflict` com `currentVersion`.

**Por que esta prioridade**: sem obras cadastradas não existem exemplares físicos, busca nem empréstimos ou reservas na biblioteca.
**Teste independente**: cadastrar uma obra válida com bibliotecária, tentar duplicar seu ISBN recebendo `409 /problems/isbn-taken`, tentar cadastrar como aluno recebendo `403 /problems/forbidden` e atualizar o título validando o incremento de versão e conflito na versão antiga.

**Critérios de aceite**:

- **[1.1]** **Dado** uma bibliotecária autenticada, **quando** envia `POST /api/v1/catalog/works` com título, autores, assunto e ISBN-13 válido (ex.: com hífens `"  978-0-13-235088-4  "`), **então** recebe HTTP `201` com header `Location`, título/autores sem espaços nas pontas, `isbn` normalizado (`"9780132350884"`), `version: 1` e evento `work.created` em `audit.events`.
- **[1.2]** **Dado** um `isbn` com dígito verificador inválido ou tamanho fora de 10/13 dígitos, **quando** tenta cadastrar ou atualizar, **então** recebe HTTP `400 /problems/validation-error` apontando `isbn`.
- **[1.3]** **Dado** uma obra já existente com determinado ISBN, **quando** a bibliotecária tenta cadastrar outra obra com o mesmo ISBN (mesmo formatado com hífens diferentes), **então** recebe HTTP `409 /problems/isbn-taken`.
- **[1.4]** **Dado** um aluno autenticado (`student`), **quando** tenta `POST /api/v1/catalog/works` ou `PATCH /api/v1/catalog/works/{workId}`, **então** recebe HTTP `403 /problems/forbidden`.
- **[1.5]** **Dado** uma bibliotecária editando uma obra existente, **quando** envia `PATCH /api/v1/catalog/works/{workId}` com a `version` atual, **então** recebe `200` com `version + 1` e `work.updated` contendo apenas campos alterados (`before`/`after`); com `version` diferente da atual, recebe `409 /problems/version-conflict` com `currentVersion`; se nenhum valor mudar após `trim`, retorna `200` sem incrementar versão nem auditar.

---

### História 2 — Buscar obras no catálogo e expor fachada do Acervo (Prioridade: P1)

**Ator**: Aluno (`student`), Bibliotecária (`librarian`) e módulo Circulação (`CatalogFacade`)
**Fluxo principal (Cockpit)**:
1. O usuário abre o catálogo e informa opcionalmente texto de busca `q` (título, autor, assunto ou ISBN), filtro `subject`, `limit` (1 a 100, padrão 20) e `cursor`.
2. O módulo `catalog` consulta apenas a tabela `catalog.works` no próprio PostgreSQL (ADR-0005), sem depender de serviço externo de busca nem cruzar schema para `circulation`.
3. A API devolve `items` ordenados do mais recente ao mais antigo (`id DESC`) e `nextCursor` opaco (`null` na última página).
4. Ao consultar `GET /api/v1/catalog/works/{workId}`, devolve os metadados completos da obra.
5. Para os demais módulos (`circulation`), o módulo expõe exclusivamente `CatalogFacade` (`getWork`, `getWorksByIds`) em memória no monólito ou via `/internal/v1/catalog/*` quando extraído (ADR-0009, ADR-0015).

**Fluxos alternativos / exceções**:
- **1a.** `cursor` malformado ou `limit` fora de 1..100 -> `400 /problems/validation-error` apontando o parâmetro.
- **4a.** `workId` inexistente -> `404 /problems/not-found`; formato UUID inválido -> `400 /problems/validation-error`.

**Por que esta prioridade**: atende `RF-04` (buscar obra por título, autor ou assunto) e `RNF-01` (resposta em até 1 segundo) mantendo fronteira limpa com Circulação.
**Teste independente**: semear 100+ obras, paginar todo o catálogo via cursor sem pular nem repetir registros, buscar por trecho de autor e medir tempo de consulta (< 1 s), além de acionar `CatalogFacade` via HTTP no modo split (`MODULES=catalog`).

**Critérios de aceite**:

- **[2.1]** **Dado** obras cadastradas no acervo, **quando** qualquer usuário autenticado (`student` ou `librarian`) chama `GET /api/v1/catalog/works?q=termo`, **então** encontra obras cujo título, algum autor, assunto ou ISBN contenham o termo (insensível a maiúsculas/minúsculas).
- **[2.2]** **Dado** mais obras que o `limit` informado, **quando** percorre todas as páginas seguindo `nextCursor`, **então** recebe cada obra exatamente uma única vez em ordem `id DESC` e a última página devolve `nextCursor: null`.
- **[2.3]** **Dado** `limit` fora de `1..100` ou `cursor` inválido, **quando** chama `GET /api/v1/catalog/works`, **então** recebe `400 /problems/validation-error` indicando o parâmetro.
- **[2.4]** **Dado** um `workId` existente, **quando** chama `GET /api/v1/catalog/works/{workId}`, **então** recebe `200` com a obra; se `workId` UUID válido não existir -> `404 /problems/not-found`.
- **[2.5]** **Dado** 1.000 obras semeadas no catálogo, **quando** executa busca por título/autor no banco local, **então** o tempo p95 permanece abaixo de 1.000 ms (meta RNF-01 e ADR-0005).
- **[2.6]** **Dado** a tela de Catálogo em React, **quando** o usuário digita uma busca, limpa ou clica em "Carregar mais", **então** vê título, autores, assunto, ISBN, resumo de exemplares da obra e botão "Reservar" ou orientação para o balcão conforme disponibilidade.

### Casos de borda

- ISBN-10 com dígito verificador `'X'` maiúsculo/minúsculo aceito e normalizado para maiúsculo -> `[1.1]`.
- Título com exatamente 200 caracteres aceito; 201 ou apenas espaços -> `400 /problems/validation-error` (`[1.2]`).
- `CatalogFacade` acionado tanto em memória quanto por `/internal/v1/catalog/works/batch` retorna exatamente os mesmos campos (`[2.4]`, prova de extração).

## Requisitos *(obrigatório)*

### Requisitos funcionais & Contrato da API

- `RF-04`: Busca de obras por título, autor ou assunto no próprio PostgreSQL (ADR-0005).
- Contrato: `contracts/openapi/paths/catalog.yaml` + `contracts/internal/facades.yaml`.
- Tabela: `catalog.works` (`contracts/db/migrations/0002_catalog.sql`).

### Regras de negócio, Auditoria e Telemetria

- `Work` e VOs `WorkTitle`, `Isbn` garantem invariantes no domínio sem tocar PostgreSQL.
- `package.json` de `packages/modules/catalog` exporta apenas `./public` e `./module`.
- Auditoria: `work.created`, `work.updated`.

## Critérios de sucesso *(obrigatório)*

- **CS-001**: RNF-01 atendido: busca em 1.000 obras no PostgreSQL local executada em < 100 ms (bem abaixo do teto de 1 s).
- **CS-002**: `CATALOG_ADAPTER=http` permite o processo de Circulação consultar obras com o processo `MODULES=catalog` isolado.

## Fora do escopo

- Integração com módulo conceitual `Aquisições` (`PurchaseItem`): obras entram diretamente pelo cadastro do acervo na PoC reduzida (Encontro 1, slide 22).
