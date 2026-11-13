# ADR-0008: Avisos de disponibilidade por e-mail institucional

- **Status**: Aceita — **Substitui a [ADR-0004](0004-aviso-por-sms.md)**
- **Data**: 2026-11-10
- **Contexto**: Fundação da Biblioteca (Encontro 1, slide 7), RF-04 e RN-08.

## Contexto e problema

Em substituição ao canal de SMS ([ADR-0004](0004-aviso-por-sms.md)), o sistema precisa notificar o aluno contemplado quando um exemplar reservado é devolvido e fica aguardando retirada por até 3 dias.

## Decisão

Enviar os avisos exclusivamente por **e-mail** através da porta `EmailSender` no módulo `notices`, acionada após o commit da devolução quando o evento `CopyReturned` indicar uma reserva contemplada (`holdId` e `studentEmail`). Cada envio exige uma **`idempotencyKey`** persistida com restrição `UNIQUE` em `notices.dispatches`, impedindo e-mails duplicados em retentativas.

Em testes e execução local sem servidor SMTP configurado, utiliza-se um adaptador em memória (`InMemoryEmailSender`) que registra cada disparo para inspeção e exibição na interface do aluno.

## Consequências

- Positivas: custo marginal nulo com e-mail institucional, histórico consultável dentro do sistema e entrega idempotente testável sem rede externa.
- Negativas: depende de entrega posterior ao commit (consistência eventual entre devolução e notificação, coberta por RN-08 e idempotência).
