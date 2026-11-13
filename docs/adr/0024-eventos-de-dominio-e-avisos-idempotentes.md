# ADR-0024: Eventos de domínio (`CopyReturned` v1) e avisos idempotentes

- **Status**: Aceita (Encontro 3 slides 15/18 e RN-08)
- **Data**: 2026-11-10

## Contexto e problema

Ao devolver um exemplar de obra com reserva ativa (RF-04, RN-08):
- Devolver o exemplar e apurar eventual multa precisam ocorrer na mesma transação da Circulação.
- Enviar o e-mail em `Notices` dentro da mesma transação acoplaria latência externa de SMTP ao balcão e violaria a fronteira de schema/role entre módulos.

## Decisão

1. O domínio de Circulação emite o evento contratual **`CopyReturned` (v1)** com o contrato publicado `{ eventVersion: 1, copyId, workId, workTitle, returnedAt, reservation: { holdId, studentId, studentEmail, studentName, expiresAt } | null }`.
2. A fatia `returnCopy` agenda via `ctx.afterCommit(...)` a entrega do evento para a porta pública de `notices` (`NoticesFacade.handleCopyReturned(event)`), rodando **após o COMMIT** e na transação própria da role `mod_notices`.
3. `Notices` deriva uma chave determinística **`idempotencyKey = "res-" + holdId`** e grava primeiro em `notices.dispatches (idempotency_key UNIQUE)`; se a chave já existir, ignora com segurança o reenvio e não dispara segundo e-mail.

## Consequências

- Positivas: falha momentânea no envio de aviso nunca cancela uma devolução no balcão; reenvios ou retentativas nunca duplicam e-mails para o aluno.
- Negativas: falhas no `afterCommit` ficam registradas no log e podem ser reprocessadas pela chave idempotente (com fila/outbox persistente se escalado além da PoC).
