# Especificação: Tabela de Multa e Consulta da Auditoria

**Pasta da fatia**: `specs/005-configuracao-multa-e-auditoria/`
**Data**: 2026-11-10
**Status**: Implementada
**Módulo(s)**: `config` (`mod_config`) · `audit` (`audit_reader`)

## Cenários de uso e critérios de aceite *(obrigatório)*

### História 1 — Consultar e atualizar o valor diário da multa com auditoria (Prioridade: P1)

**Ator**: Bibliotecária (`librarian`) e Aluno (`student`, apenas leitura)
**Fluxo principal (Cockpit)**:
1. O usuário consulta `GET /api/v1/config/fine-rate` e obtém `{ id: "default", dailyRateCents: 100, version: 1, updatedAt }` (padrão R\$ 1,00/dia definido na ADR-0007).
2. Quando precisa alterar a tarifa diária sem deploy, a bibliotecária envia `PATCH /api/v1/config/fine-rate` com `{ dailyRateCents, version }`.
3. O agregado `FineRate` valida o intervalo (`1..100000` centavos inteiros), aplica o incremento de `version` e grava `WHERE id = 'default' AND version = $version`.
4. Na mesma transação (`mod_config`), o Mediador grava em `audit.events` a ação `fine_rate.updated` com `changes: { dailyRateCents: { before, after } }` (exigência explícita da ADR-0007).
5. Devoluções futuras em Circulação passam a ler o novo valor por `FineRateFacade.currentDailyRateCents()`, enquanto multas já gravadas preservam o `daily_rate_cents` vigente no momento da devolução (`RN-04`, `RN-08`).

**Fluxos alternativos / exceções**:
- **2a.** Aluno tenta alterar o valor -> `403 /problems/forbidden`.
- **2b.** Valor `dailyRateCents <= 0`, decimal, ausente ou campo desconhecido -> `400 /problems/validation-error`.
- **3a.** `version` enviada difere da atual no banco -> `409 /problems/version-conflict` com `currentVersion` (ADR-0021).
- **3b.** `dailyRateCents` igual ao atual com a versão atual -> responde `200` com o registro inalterado, sem incrementar versão nem gerar evento de auditoria.

**Por que esta prioridade**: operacionaliza a ADR-0007 (valor em tabela auditada sem deploy) e demonstra concorrência otimista (`409` + componente `VersionConflict`) e integridade histórica das multas antigas.
**Teste independente**: alterar tarifa de `100` para `250`, conferir `fine_rate.updated` em `audit.events`, tentar gravar com a versão antiga recebendo `409`, e confirmar que nova devolução atrasada usa `250` enquanto multa anterior permaneceu `100`.

**Critérios de aceite**:

- **[1.1]** **Dado** o sistema migrado, **quando** qualquer usuário autenticado chama `GET /api/v1/config/fine-rate`, **então** recebe `200` com `{ id: "default", dailyRateCents: 100, version: 1 }`.
- **[1.2]** **Dado** uma bibliotecária autenticada, **quando** envia `PATCH /api/v1/config/fine-rate` com `{ dailyRateCents: 250, version: 1 }`, **então** recebe `200` com `version: 2` e evento `fine_rate.updated` em `audit.events` registrando `before: 100` e `after: 250` (ADR-0007).
- **[1.3]** **Dado** uma `version` defasada ou duas alterações simultâneas, **quando** enviadas, **então** a primeira vence e a segunda recebe `409 /problems/version-conflict` com `currentVersion`.
- **[1.4]** **Dado** um aluno tentando `PATCH /api/v1/config/fine-rate`, **quando** envia, **então** recebe `403 /problems/forbidden`.
- **[1.5]** **Dado** uma multa já registrada a `100` centavos/dia antes da alteração, **quando** a tarifa muda para `250` e ocorre nova devolução com atraso, **então** a multa antiga continua com `dailyRateCents: 100` e a nova usa `250`.

---

### História 2 — Consultar a trilha de auditoria (`audit.events`) (Prioridade: P2)

**Ator**: Bibliotecária (`librarian`)
**Fluxo principal (Cockpit)**:
1. A bibliotecária abre a aba "Auditoria" ou chama `GET /api/v1/audit-events` podendo filtrar por `action`, `actorId`, `resourceType`, `resourceId`, `result`, período (`from` inclusivo a `to` exclusivo), `limit` e `cursor`.
2. O módulo `audit` abre transação somente de leitura com a role `audit_reader` (`SELECT` exclusivo em `audit.events`).
3. Devolve os eventos ordenados do mais recente ao mais antigo (`id DESC`) com `nextCursor`.

**Fluxos alternativos / exceções**:
- **1a.** Usuário `student` tenta consultar `GET /api/v1/audit-events` -> `403 /problems/forbidden`.
- **1b.** `from` posterior ou igual a `to`, cursor inválido ou `limit` fora de `1..100` -> `400 /problems/validation-error`.

**Critérios de aceite**:

- **[2.1]** **Dado** operações auditadas (`work.created`, `loan.created`, `copy.returned`, `fine_rate.updated`), **quando** a bibliotecária chama `GET /api/v1/audit-events`, **então** vê os eventos em ordem `id DESC` com ator, ação, resultado, `requestId` e `changes`.
- **[2.2]** **Dado** filtros `?action=fine_rate.updated&result=success` ou janela `?from=...&to=...` ou paginação por `cursor`, **quando** consulta, **então** retorna apenas os eventos correspondentes sem pular nem repetir itens; `from >= to` responde `400 /problems/validation-error`.
- **[2.3]** **Dado** um `student` autenticado, **quando** chama `GET /api/v1/audit-events`, **então** recebe `403 /problems/forbidden`.
- **[2.4]** **Dado** a interface React de "Configurações e Auditoria", **quando** duas abas tentam salvar a multa com a mesma versão, **então** a segunda vê o alerta de conflito de versão com botão "Recarregar dados atuais" e consegue revisar os eventos auditados logo abaixo (`[1.3]`, `[2.1]`).

### Casos de borda

- `audit_reader` tentando `INSERT` ou `UPDATE` em `audit.events` é recusada pelo próprio PostgreSQL -> verificado em teste de integração SQL.
- `PATCH /api/v1/config/fine-rate` com mesmo valor e versão atual -> `200` sem incremento nem evento (`[1.2]`).

## Requisitos *(obrigatório)*

### Requisitos funcionais & Contrato da API

- Contrato em `contracts/openapi/paths/config.yaml` e `contracts/openapi/paths/audit.yaml`.
- Tabelas `config.fine_rates` (`0005_config.sql`) e `audit.events` (`0006_audit.sql`).

### Regras de negócio, Auditoria e Telemetria

- Auditoria: `fine_rate.updated` (mudanças `dailyRateCents { before, after }`). Leitura em `GET /api/v1/audit-events` não grava evento próprio na auditoria (ADR-0012).

## Critérios de sucesso *(obrigatório)*

- **CS-001**: Valor padrão de multa editável em produção sem deploy, com auditoria garantida na mesma transação e proteção contra edição concorrente via `version`.

## Fora do escopo

- Tabelas distintas por categoria de obra ou curso — há uma única tarifa diária (`id = 'default'`) para a biblioteca na PoC reduzida (ADR-0007).
