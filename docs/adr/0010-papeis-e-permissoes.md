# ADR-0010: Papéis e permissões (Bibliotecária e Aluno)

- **Status**: Aceita (adaptada da SenseUp ADR-0010 / ADR-0049)
- **Data**: 2026-11-10

## Contexto e problema

As operações da biblioteca dividem responsabilidades claras entre quem opera o balcão/gestão do sistema e quem utiliza os serviços como usuário final.

## Decisão

Definir dois papéis explícitos no `Principal` da aplicação:

1. **`librarian` (Bibliotecária)**: cataloga obras (`Work`), registra e dá baixa em exemplares (`Copy`), executa empréstimo (`lendCopy`), devolução (`returnCopy`), retirada de reserva (`withdrawReservedCopy`), expiração de reserva (`expireHold`), renovação no balcão (`renewLoan`), quitação de multa (`payFine`), altera tabela de multa (`updateFineRate`), consulta qualquer aluno e lê a trilha completa de auditoria (`audit.events`).
2. **`student` (Aluno)**: busca e consulta obras no catálogo, visualiza seus próprios empréstimos/multas/reservas/avisos (`ownership check: studentId === principal.studentId`), realiza auto-reserva (`placeHold`) e auto-renovação de seu próprio empréstimo quando habilitado.

A verificação de políticas fica centralizada numa interface `Authorizer` no núcleo transversal, executada pelo `Mediator` antes de qualquer preparo ou escrita. Tentativas negadas geram registro `authz.denied` em `audit.events` e retornam `403 forbidden`.

## Consequências

- Positivas: política uniforme e auditável sem `if (role)` espalhados pelos repositórios.
- Negativas: cada novo caso de uso precisa declarar explicitamente seu requisito em `authorize`.
