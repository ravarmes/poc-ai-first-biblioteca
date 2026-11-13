# ADR-0013: Captura atômica da auditoria pelo mediador

- **Status**: Aceita (adaptada da SenseUp ADR-0014)
- **Data**: 2026-11-10

## Contexto e problema

Se cada fatia de negócio gravasse auditoria por conta própria depois de commitar ou em outra conexão, um erro parcial deixaria dados sem auditoria ou auditoria fantasma de operações revertidas.

## Decisão

Todo caso de uso passa pelo `Mediator` em `packages/core/src/mediator/mediator.ts`, que executa uma cadeia fixa de comportamentos:

`tracing → authorization → prepare → unitOfWork → audit → handler` (com `compensate` em falha pós-preparo e `afterCommit` após `COMMIT`).

O handler apenas emite eventos em memória (`ctx.emit(...)`); o comportamento de auditoria persiste todos os eventos em `audit.events` **dentro da mesma transação** do módulo antes do `COMMIT`. Negação de autorização grava `authz.denied` numa transação dedicada de sistema antes de responder `403`.

## Consequências

- Positivas: impossível salvar uma multa ou mudar a tarifa diária sem gravar o evento de auditoria correspondente — se a transação sofrer rollback, o evento some junto.
- Negativas: ações puramente de leitura não passam `emit` útil (ou emitem lista vazia sem SQL adicional).
