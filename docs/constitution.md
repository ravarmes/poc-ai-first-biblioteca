# Constituição — PoC AI-First Biblioteca Universitária

Os dez princípios que governam especificações, arquitetura, código, testes e operação neste projeto, adaptados da constituição da PoC da SenseUp para a stack única **Node.js + TypeScript + React**. Em conflito entre preferência local e um princípio aqui, vale este documento.

## I. Contrato primeiro (OpenAPI + SQL)

Toda mudança na API externa, nos erros RFC 9457 (`/problems/<código>`) ou no esquema relacional começa nos arquivos de contrato em [`contracts/openapi/`](../contracts/openapi/openapi.yaml) e [`contracts/db/`](../contracts/db/README.md). Nenhum código de borda inventa campos não declarados no contrato: requisições usam validação estrita (`strict()`) que recusa campos inesperados com `validation-error` (`400`).

## II. Fronteiras verificáveis (código e banco)

Fronteira que depende só de disciplina humana quebra. Neste repositório:

- **No código**: `packages/modules/<módulo>/` só é importado por outro módulo através de `/public`; `package.json#exports` impede atalhos internos no runtime e o `dependency-cruiser` falha o build caso uma fatia, adaptador ou aplicação importe a camada errada.
- **No banco**: cada módulo possui seu próprio schema PostgreSQL e sua própria role `NOLOGIN` (`mod_catalog`, `mod_circulation`, `mod_notices`, `mod_config`, `audit_reader`). Chaves estrangeiras cruzam apenas tabelas dentro do mesmo schema; referências entre módulos (como `Copy.workId`) guardam somente o UUID.

## III. Isolamento do domínio e integridade transacional

O subdomínio principal (`circulation`) concentra invariantes de negócio em objetos de valor, raízes de agregado e serviços de domínio puros, sem dependência de HTTP, SQL ou frameworks. Regras que envolvem dois agregados ou escrita em outro módulo respeitam a fronteira transacional:

- Fatos que exigem consistência imediata na Circulação (ex.: registrar devolução no `Copy`, fechar `Loan`, gravar `Fine` no `Student` e reservar para o primeiro `Hold`) ocorrem na mesma unidade de trabalho do módulo.
- Efeitos em outro contexto delimitado (`Avisos` após devolução de exemplar reservado) ocorrem em transação própria após o `COMMIT` (via evento de domínio publicado), protegidos por **chave de idempotência** (`idempotencyKey`) para evitar envios duplicados em retentativas.

## IV. Segurança, papéis e menor privilégio

Acesso autenticado distingue claramente os papéis do domínio: `librarian` (bibliotecária no balcão/gestão) e `student` (aluno consultando acervo, próprios empréstimos, multas, reservas e avisos). Nenhum aluno altera empréstimos de terceiros, catálogo ou tabela de multa. A role de conexão da aplicação (`app`) é `NOINHERIT` e não possui privilégios diretos sobre tabelas de negócio: somente a unidade de trabalho veste temporariamente (`LOCAL`) a role do módulo durante a transação.

## V. Spec-first, testes por critério e mutação ≥ 80%

Toda funcionalidade nasce em `specs/00N-.../spec.md` com histórias por caso de uso e critérios numerados `[n.n]` no formato Dado/Quando/Então. Nenhuma funcionalidade é dada como concluída sem:

1. Testes de unidade cobrindo invariantes, máquina de estados e valores-limite do domínio.
2. Testes de fatia cobrindo os handlers, o mediador e os erros de contrato.
3. Testes de integração SQL verificando migrations, controle otimista e isolamento entre schemas/roles.
4. Testes ponta a ponta da API e componentes React ligados explicitamente aos critérios `[n.n]`.
5. Nota de mutação **≥ 80%** em domínio e fatias com Stryker.

## VI. Observabilidade explícita e sem dados pessoais em telemetria

Logs estruturados e rastros acompanham `requestId`, identificador do caso de uso, role ativa do módulo e IDs técnicos de correlação (`work.id`, `copy.id`, `student.id`), **nunca** registrando nome civil completo, RA em logs livres ou e-mails em spans/métricas. Leituras vão para telemetria; mutações e negações de acesso vão também para a auditoria persistida.

## VII. Auditoria atômica e só de acréscimo

Alterações de negócio e decisões de configuração (como mudança do valor diário da multa pela ADR-0007) e negações de autorização (`authz.denied`) são gravadas em `audit.events` pelo comportamento de auditoria do mediador: mutações dentro da mesma transação de negócio (se o negócio falhar, o evento não sobrevive ao rollback); negações em transação própria. Nenhuma role de módulo possui `UPDATE` ou `DELETE` em `audit.events`.

## VIII. Migrations imutáveis e compatíveis para frente

Migrations em `contracts/db/migrations/` são numeradas sequencialmente (`NNNN_nome.sql`), conferidas por checksum SHA-256 pelo runner especificado (`contracts/db/README.md`), protegidas por trava consultiva e aplicadas uma única vez. Após versionada, uma migration não é reescrita: evoluções usam expandir/contrair.

## IX. Simplicidade pragmática e um caminho canônico

- Stack única Node.js + TypeScript + React — sem código duplicado para múltiplas linguagens nesta PoC.
- Nenhuma dependência externa pesada (Docker obrigatório ou brokers externos) impede rodar toda a suíte em segundos localmente: o driver PostgreSQL `pg` atua em produção/PostgreSQL 18 e o motor SQL embutido/memória (`PGlite` PostgreSQL WASM + adaptadores fake explícitos nas bordas externas `Secretaria`, `Calendário` e `EmailSender`) garante testes determinísticos no host.
- O monólito modular já suporta ativação seletiva por `MODULES=...` e fachadas substituíveis (`inprocess` vs `http`), evitando criar microserviços prematuros enquanto mantém a porta aberta para extração futura.

## X. Idioma consistente e decisões documentadas

Todo código-fonte, contrato de API/SQL e evento usa **inglês** (`ADR-0030`); toda especificação, ADR, interface de usuário, detalhe de problema RFC 9457, comentário e nome de teste usa **português (`pt-BR`)**. Decisões arquiteturais novas entram em `docs/adr/` em formato MADR antes de virarem convenção implícita.

## Governança

Alterações nesta constituição exigem atualização simultânea das regras em [`AGENTS.md`](../AGENTS.md) e registro de impacto nos planos de especificação afetados.
