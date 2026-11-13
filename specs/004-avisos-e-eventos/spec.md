# Especificação: Avisos por E-mail e Eventos de Domínio

**Pasta da fatia**: `specs/004-avisos-e-eventos/`
**Data**: 2026-11-10
**Status**: Implementada
**Módulo(s)**: `notices` (`packages/modules/notices`) · schema `notices` (`mod_notices`) · consome evento `CopyReturned` v1

## Cenários de uso e critérios de aceite *(obrigatório)*

### História 1 — Processar evento `CopyReturned` v1 e enviar aviso idempotente (Prioridade: P1)

**Ator**: Sistema (pós-`COMMIT` da Circulação)
**Fluxo principal (Cockpit)**:
1. Após o `COMMIT` bem-sucedido de `returnCopy` ou `expireHold` que atribuiu um exemplar reservado para a próxima reserva `"ready"`, o Mediador dispara no hook `afterCommit` o comando interno `NoticesFacade.handleCopyReturned(event)` com `CopyReturned` v1: `{ eventId, schemaVersion: 1, occurredAt, copyId, barcode, workId, workTitle, assignedHold: { holdId, studentId, studentRegistration, recipientEmail, expiresAt } }`.
2. Se `assignedHold` for `null` (ninguém na fila), o consumidor encerra sem enviar e-mail.
3. Caso haja `assignedHold`, o consumidor constrói `idempotencyKey = "res-" + assignedHold.holdId` (ADR-0008, ADR-0024).
4. Dentro de uma transação própria (`mod_notices`), grava o despacho em `notices.dispatches` com `ON CONFLICT (idempotency_key) DO NOTHING`:
   - se inseriu a linha pela primeira vez (`status: "sent"`), aciona `EmailSender.send(...)` e registra `notice.sent` na auditoria;
   - se a chave já existia (reentrega do mesmo `holdId`), devolve `"skipped"` sem chamar `EmailSender.send(...)` novamente!

**Fluxos alternativos / exceções**:
- **1a.** `returnCopy` sofre `ROLLBACK` (ex.: erro simulado na gravação da multa) -> o hook `afterCommit` **nunca** executa e nenhum aviso é gravado ou enviado (`RN-08`).
- **4a.** Evento chega duas vezes (reentrega por rede ou teste explícito de idempotência) -> o segundo processamento devolve `"skipped"` e o contador de e-mails no `InMemoryEmailSender` permanece `1`.

**Por que esta prioridade**: separa consistência imediata dentro da transação da consistência eventual entre contextos (ADR-0024), eliminando spam em reentrega.
**Teste independente**: devolver livro com fila -> confirmar 1 e-mail enviado; reenviar exatamente o mesmo evento `CopyReturned` v1 -> confirmar 0 envios adicionais; simular falha na transação de devolução -> confirmar 0 envios.

**Critérios de aceite**:

- **[1.1]** **Dado** um evento `CopyReturned` v1 com `assignedHold` preenchido, **quando** entregue pela primeira vez à `NoticesFacade`, **então** persiste registro em `notices.dispatches` com `idempotency_key = "res-" + holdId`, `status = "sent"`, chama `EmailSender` uma vez e audita `notice.sent`.
- **[1.2]** **Dado** o mesmo `holdId` já registrado em `notices.dispatches`, **quando** o evento `CopyReturned` v1 for reprocessado (mesmo com outro `eventId`), **então** **não** envia novo e-mail (`status: "skipped"`) e o total de envios permanece 1 (`RN-08`, ADR-0008).
- **[1.3]** **Dado** uma transação de devolução que falhou antes do `COMMIT`, **quando** a operação é abortada, **então** `NoticesFacade` não é chamada e `notices.dispatches` permanece inalterada.

---

### História 2 — Consultar histórico de avisos enviados (Prioridade: P2)

**Ator**: Aluno (`student`, próprios avisos) ou Bibliotecária (`librarian`, todos ou por matrícula)
**Critérios de aceite**:

- **[2.1]** **Dado** avisos gravados para diferentes alunos, **quando** um aluno autenticado chama `GET /api/v1/notices`, **então** recebe apenas os avisos com sua `studentRegistration`, paginados por cursor (`id DESC`); se enviar `studentRegistration` de outro aluno no filtro -> `403 /problems/forbidden`.
- **[2.2]** **Dado** uma bibliotecária autenticada, **quando** chama `GET /api/v1/notices` (com ou sem `?studentRegistration=`), **então** visualiza os avisos filtrados com assunto, destinatário, `idempotencyKey` e timestamp.

### Casos de borda

- Evento `CopyReturned` v1 com `schemaVersion !== 1` rejeitado explicitamente no contrato de entrada (`[1.1]`).
- Mensagem em `pt-BR` inclui título da obra, código do exemplar reservado e prazo limite para retirada em 3 dias.

## Requisitos *(obrigatório)*

### Requisitos funcionais & Contrato da API

- Contrato HTTP: `contracts/openapi/paths/notices.yaml`.
- Contrato de evento versionado: `CopyReturnedEventV1` em `packages/contract`.
- Tabela `notices.dispatches` em `contracts/db/migrations/0004_notices.sql`.

### Regras de negócio, Auditoria e Telemetria

- `idempotency_key` com índice `UNIQUE` no PostgreSQL garante segurança mesmo sob entrega concorrente.
- Auditoria: `notice.sent`.

## Critérios de sucesso *(obrigatório)*

- **CS-001**: Entrega única por reserva provada tanto em memória quanto em banco PostgreSQL real sob duas chamadas concorrentes (`Promise.all`) para o mesmo `holdId`.

## Fora do escopo

- Envio por SMS (descartado pela ADR-0004 em favor da ADR-0008).
- Provedor SMTP externo em nuvem nesta PoC local (porta `EmailSenderPort` implementada com `InMemoryEmailSender` inspecionável em desenvolvimento/testes e interface pronta para adaptador SMTP).
