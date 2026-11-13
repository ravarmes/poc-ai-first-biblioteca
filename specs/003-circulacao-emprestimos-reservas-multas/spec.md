# Especificação: Circulação — Empréstimos, Devoluções, Reservas e Multas

**Pasta da fatia**: `specs/003-circulacao-emprestimos-reservas-multas/`
**Data**: 2026-11-10
**Status**: Implementada
**Módulo(s)**: `circulation` (domínio essencial) · consome `catalog/public`, `config/public`, `notices/public` · schema `circulation` (`mod_circulation`)

## Cenários de uso e critérios de aceite *(obrigatório)*

### História 1 — Emprestar exemplar no balcão (`lendCopy`) (Prioridade: P1)

**Ator**: Bibliotecária (`librarian`)
**Fluxo principal (Cockpit)**:
1. A bibliotecária lê no balcão a matrícula do aluno e o código de barras do exemplar (`POST /api/v1/circulation/loans`).
2. Na etapa `prepare` (antes da transação), o sistema consulta a **Secretaria Acadêmica** via camada anticorrupção (ACL), traduzindo `{ ra, nome_civil, sit_matricula, cod_curso, email_institucional }` para o objeto do domínio `AcademicStudent` (`RN-06`), e consulta a tabela `dias_letivos` no **Calendário Acadêmico** (Conformista) para calcular a data de vencimento em **14 dias letivos** (`RN-05`).
3. Na transação única (`mod_circulation`), sincroniza os dados locais do aluno em `circulation.students`, verifica se o aluno não possui multa pendente (`RN-01`), se está abaixo do limite de 3 empréstimos em aberto (`RN-02`) e se o exemplar está `available` (`RN-07`), mantendo apenas os IDs (`studentId`, `copyId`, `workId`) sem FK para `catalog` (`RN-03`).
4. Cria o `Loan` com status `"open"`, transiciona o `Copy` para `"on-loan"` com incremento de `version`, grava `loan.created` em `audit.events` e devolve HTTP `201` com `Location`.

**Fluxos alternativos / exceções**:
- **1a.** Usuário com papel `student` tenta efetuar empréstimo -> `403 /problems/forbidden`.
- **2a.** Matrícula não localizada na Secretaria -> `404 /problems/not-found`; situação diferente de `"MATRICULADO"` (`TRANCADO`, `CANCELADO`, `CONCLUIDO`) -> `409 /problems/student-inactive`.
- **3a.** Aluno possui multa pendente -> `409 /problems/pending-fine`.
- **3b.** Aluno já possui 3 empréstimos em aberto -> `409 /problems/loan-limit-reached`.
- **3c.** Exemplar inexistente -> `404 /problems/not-found`; exemplar em `"on-loan"`, `"reserved"` ou `"retired"` -> `409 /problems/invalid-copy-state`.

**Por que esta prioridade**: é a operação central da biblioteca que conecta ACL (Secretaria), Conformista (Calendário) e invariantes do agregado `Student`/`Copy`.
**Teste independente**: emprestar 3 exemplares a um aluno matriculado, confirmar que o vencimento pula finais de semana/feriados conforme `dias_letivos`, bloquear o 4º exemplar com `loan-limit-reached`, bloquear aluno trancado com `student-inactive` e bloquear aluno com multa pendente.

**Critérios de aceite**:

- **[1.1]** **Dado** uma bibliotecária, um exemplar `available` e um aluno `"MATRICULADO"` sem multas e com menos de 3 empréstimos em aberto, **quando** envia `POST /api/v1/circulation/loans`, **então** recebe `201` com o empréstimo (`status: "open"`, `dueDate` exatamente no 14º dia letivo após a data do empréstimo), o exemplar passa a `"on-loan"` e `loan.created` é auditado.
- **[1.2]** **Dado** um aluno com 3 empréstimos `"open"`, **quando** tenta emprestar o 4º exemplar, **então** recebe `409 /problems/loan-limit-reached` e nada muda (`RN-02`).
- **[1.3]** **Dado** um exemplar no estado `"on-loan"`, `"reserved"` ou `"retired"`, **quando** tenta emprestar, **então** recebe `409 /problems/invalid-copy-state` (`RN-07`).
- **[1.4]** **Dado** um aluno com multa `"pending"`, **quando** tenta emprestar, **então** recebe `409 /problems/pending-fine` (`RN-01`).
- **[1.5]** **Dado** um aluno cuja situação na Secretaria é `"TRANCADO"`, `"CANCELADO"` ou `"CONCLUIDO"`, **quando** tenta emprestar, **então** recebe `409 /problems/student-inactive` sem criar registro em `circulation.students` (`RN-06`).
- **[1.6]** **Dado** duas bibliotecárias tentando emprestar exatamente o mesmo exemplar simultaneamente, **quando** enviam em paralelo, **então** apenas uma vence (`201`) e a outra recebe `409` sem duplicar empréstimo aberto (`UNIQUE loans_one_open_per_copy_idx` + `version`).

---

### História 2 — Devolver exemplar com multa atômica e atendimento da fila (`returnCopy`) (Prioridade: P1)

**Ator**: Bibliotecária (`librarian`)
**Fluxo principal (Cockpit)**:
1. A bibliotecária lê o código de barras do exemplar devolvido (`POST /api/v1/circulation/returns`).
2. No `prepare` (fora da transação de Circulação), o Mediador lê o valor diário da multa pela fachada `ConfigFacade` (ADR-0007) e o título da obra pela `CatalogFacade`.
3. Dentro da mesma transação (`mod_circulation`), o handler fecha o `Loan` (`status: "returned"`, `returnedAt`), calcula os dias em atraso (`dueDate` até `returnedAt`):
   - se houver atraso (`overdueDays > 0`), cria `Fine` (`overdueDays * dailyRateCents`, `status: "pending"`) na **mesma transação** (`RN-08`).
4. Verifica na tabela `circulation.holds` se existe reserva `"waiting"` mais antiga na fila FIFO dessa `workId`:
   - **se houver reserva aguardando**: o `Hold` passa a `"ready"` (`assignedCopyId = copy.id`, `expiresAt = returnedAt + 3 dias`), o `Copy` passa a `"reserved"` (`RN-07`), e é registrado um `afterCommit` emitindo `CopyReturned` v1 para `NoticesFacade`;
   - **se não houver reserva**: o `Copy` volta para `"available"`.
5. Grava `copy.returned` (e eventuais mudanças em multa/reserva) em `audit.events` junto com o `COMMIT`.

**Fluxos alternativos / exceções**:
- **1a.** Exemplar inexistente -> `404 /problems/not-found`; exemplar que não está `"on-loan"` -> `409 /problems/no-active-loan`.
- **3a.** Falha simulada ao gravar a multa após fechar o empréstimo -> toda a transação sofre `ROLLBACK`, mantendo empréstimo em aberto e exemplar `"on-loan"` (`RN-08`).

**Por que esta prioridade**: é a fatia didática destacada no Encontro 3 slides 32–33 (três critérios essenciais no núcleo: sem atraso e sem reserva, com atraso gera multa atômica, com reserva dispara evento).
**Teste independente**: devolver em dia sem reserva (`Copy -> available`), devolver com 3 dias de atraso verificando `Fine` de R\$ 3,00 na mesma tx e multa em 2º valor após `PATCH /config/fine-rate`, devolver exemplar de obra com reserva `"waiting"` verificando `Hold -> ready`, `Copy -> reserved` e disparo de `CopyReturned` v1 pós-commit.

**Critérios de aceite**:

- **[2.1]** **Dado** exemplar `"on-loan"` devolvido até a `dueDate` e sem reserva aguardando, **quando** chama `POST /api/v1/circulation/returns`, **então** fecha o empréstimo, o exemplar passa a `"available"`, `fine` é `null` e `assignedHold` é `null`.
- **[2.2]** **Dado** exemplar `"on-loan"` devolvido após a `dueDate`, **quando** devolve, **então** fecha o empréstimo e grava na **mesma transação** a `Fine` pendente com `amountCents = overdueDays * dailyRateCents` vigente em `ConfigFacade` (`RN-04`, `RN-05`, `RN-08`). Se houver erro ao gravar a multa, faz rollback completo do empréstimo e do exemplar.
- **[2.3]** **Dado** obra com reserva `"waiting"` na fila FIFO, **quando** o exemplar é devolvido, **então** o primeiro `Hold` da fila passa a `"ready"` com `assignedCopyId` e `expiresAt` em 3 dias, o `Copy` passa a `"reserved"`, e após o `COMMIT` o evento `CopyReturned` v1 é entregue à fachada de Avisos (`RN-07`).
- **[2.4]** **Dado** exemplar em `"available"`, `"reserved"` ou `"retired"`, **quando** tenta devolver, **então** recebe `409 /problems/no-active-loan`.

---

### História 3 — Reservar obra, retirar exemplar reservado e dar baixa em reserva expirada (Prioridade: P1)

**Ator**: Aluno (`student`) e Bibliotecária (`librarian`)
**Fluxo principal (Cockpit)**:
1. **Reservar (`placeHold`)**: quando todos os exemplares de uma obra estão indisponíveis (nenhum `"available"`), o aluno (ou a bibliotecária em seu nome) solicita reserva (`POST /api/v1/circulation/holds`), validando matrícula ativa via ACL da Secretaria e ausência de outra reserva ativa para a mesma obra -> cria `Hold` `"waiting"`.
2. **Retirar reserva (`withdrawReservedCopy`)**: dentro do prazo de 3 dias (`now <= expiresAt`), o aluno comparece ao balcão e a bibliotecária chama `POST /api/v1/circulation/holds/{holdId}/withdraw` -> verifica se o aluno não tem multa pendente e respeita o limite de 3 empréstimos, converte `Hold -> "fulfilled"`, `Copy -> "on-loan"` e abre `Loan`.
3. **Dar baixa de reserva expirada (`expireHold`)**: após vencer `expiresAt` (`now > expiresAt`), a bibliotecária aciona `POST /api/v1/circulation/holds/{holdId}/expire` -> marca o `Hold` como `"expired"`; se houver outra reserva `"waiting"` na fila FIFO da obra, promove-a imediatamente para `"ready"` (+3 dias) e agenda `CopyReturned` v1 pós-commit mantendo o `Copy` em `"reserved"`; caso contrário, libera o `Copy` de `"reserved"` para `"available"`.

**Critérios de aceite**:

- **[3.1]** **Dado** uma obra sem nenhum exemplar `"available"` e um aluno ativo sem reserva ativa nessa obra, **quando** envia `POST /api/v1/circulation/holds`, **então** recebe `201` com `Hold` `"waiting"` e entra em ordem FIFO; se houver exemplar `"available"`, recebe `409 /problems/copy-available-use-loan`.
- **[3.2]** **Dado** um aluno já com reserva `"waiting"` ou `"ready"` na obra, **quando** tenta reservar novamente a mesma obra, **então** recebe `409 /problems/hold-already-exists`.
- **[3.3]** **Dado** dois alunos na fila FIFO (`A` antes de `B`), **quando** o exemplar é devolvido e `A` comparece antes de `expiresAt`, **então** apenas `A` consegue retirar (`POST /holds/{id}/withdraw`) gerando `Loan` e `Hold -> "fulfilled"`; se a retirada já estiver expirada (`now > expiresAt`), recebe `409 /problems/hold-expired`.
- **[3.4]** **Dado** uma reserva `"ready"` cujo `expiresAt` já venceu, **quando** a bibliotecária chama `POST /holds/{id}/expire`, **então** marca `"expired"` e: (a) se existir reserva `B` `"waiting"`, promove `B` para `"ready"` e emite `CopyReturned` v1; (b) se a fila estiver vazia, transiciona o `Copy` para `"available"`.

---

### História 4 — Renovar empréstimo ativo (`renewLoan`) (Prioridade: P2)

**Ator**: Aluno (`student`, nos próprios empréstimos) ou Bibliotecária (`librarian`)
**Critérios de aceite**:

- **[4.1]** **Dado** um empréstimo `"open"` sem reserva `"waiting"` na obra e aluno sem multa pendente, **quando** envia `POST /api/v1/circulation/loans/{loanId}/renew` com `version` atual, **então** `dueDate` avança para 14 dias letivos a partir da data corrente, `renewalsCount` aumenta em 1 e `version` aumenta em 1.
- **[4.2]** **Dado** uma obra com ao menos uma reserva `"waiting"` aguardando devolução, **quando** tenta renovar o empréstimo de qualquer exemplar dessa obra, **então** recebe `409 /problems/active-hold-blocks-renewal` (`RN-07`).
- **[4.3]** **Dado** um aluno com multa `"pending"` ou outro aluno tentando renovar empréstimo de terceiros, **quando** envia `renew`, **então** recebe `409 /problems/pending-fine` (multa) ou `403 /problems/forbidden` (outro aluno).
- **[4.4]** **Dado** versão defasada no pedido de renovação, **quando** envia, **então** recebe `409 /problems/version-conflict` com `currentVersion`.

---

### História 5 — Cadastrar/baixar exemplar, quitar multa e consultar situação do aluno (`RF-05`) (Prioridade: P1)

**Ator**: Bibliotecária (`librarian`) e Aluno (`student`, apenas própria situação)
**Critérios de aceite**:

- **[5.1]** **Dado** `workId` existente em `CatalogFacade`, **quando** a bibliotecária envia `POST /api/v1/circulation/copies` com `{ workId, barcode }`, **então** grava `Copy` `"available"` (código em maiúsculas sem espaços nas pontas); código repetido responde `409 /problems/barcode-taken` (`ADR-0006`) e `workId` inexistente responde `404 /problems/not-found`.
- **[5.2]** **Dado** exemplar `"available"`, **quando** a bibliotecária dá baixa definitiva (`POST /copies/{id}/retire` com `version`), **então** passa para `"retired"`; se estiver `"on-loan"` ou `"reserved"`, responde `409 /problems/invalid-copy-state`.
- **[5.3]** **Dado** aluno com multa `"pending"`, **quando** a bibliotecária chama `POST /api/v1/circulation/fines/{fineId}/pay` com `version`, **então** multa passa para `"paid"` e o aluno volta a poder emprestar e renovar (`RF-02`, `RN-01`).
- **[5.4]** **Dado** um aluno autenticado consultando a própria matrícula (`GET /api/v1/circulation/students/{registration}/summary`) ou a bibliotecária consultando qualquer aluno, **quando** chama o endpoint, **então** vê `openLoans`, `holds`, `fines` e `activeLoansCount/loanLimit`; se um aluno tentar consultar a matrícula de outro aluno, recebe `403 /problems/forbidden` (`RF-05`).
- **[5.5]** **Dado** as telas React da Circulação ("Balcão da Bibliotecária" e "Meus Empréstimos"), **quando** usadas no navegador, **então** o usuário realiza empréstimo, devolução com exibição da multa/reserva criada, reserva no catálogo, renovação, retirada/baixa de reserva e quitação de multa em `pt-BR`.

### Casos de borda

- Transição de estados proibida em `Copy` (ex.: `retired -> available` ou `available -> reserved` sem devolução) lançando erro de invariante no domínio (`domain/`) -> testada sem banco em `copy.test.ts` e morta pelo Stryker.
- Relógio determinístico injetado (`ClockPort`) para testar cálculo de atraso, vencimento em 14 dias letivos e expiração após 3 dias (`[2.2]`, `[3.3]`, `[3.4]`).

## Requisitos *(obrigatório)*

### Requisitos funcionais & Contrato da API

- Contrato em `contracts/openapi/paths/circulation.yaml`.
- Tabelas `circulation.*` em `contracts/db/migrations/0003_circulation.sql`.
- Nenhuma FK para `catalog.works` ou `notices.*`.

### Regras de negócio, Auditoria e Telemetria

- Implementa integralmente `RN-01` a `RN-08`.
- Eventos auditados: `copy.registered`, `copy.retired`, `loan.created`, `loan.renewed`, `copy.returned`, `hold.placed`, `hold.fulfilled`, `hold.expired`, `fine.paid`.

## Critérios de sucesso *(obrigatório)*

- **CS-001**: Todos os critérios `[1.1]` a `[5.5]` verificados por testes automatizados, com taxa de mutação ≥ 80% no domínio de Circulação (`Student`, `Copy`, `Loan`, `Fine`, `Hold`, `computeDueDate`, `calculateOverdueFine`).

## Fora do escopo

- Processamento agendado em background (cron) para expirar reservas automaticamente — na PoC a baixa é acionada explicitamente pela bibliotecária (`expireHold`) após o prazo de 3 dias.
