# ADR-0025: Objetos de valor, agregados e máquina de estados no domínio

- **Status**: Aceita (Encontro 2 slides 7, 12, 23 e Encontro 1 slide 26)
- **Data**: 2026-11-10

## Contexto e problema

Validar ISBN, código de barras, dinheiro ou limite de empréstimos em controllers/handlers repete regras e permite estados inválidos caso surja um novo ponto de entrada.

## Decisão

- Modelar conceitos com regras próprias como **Objetos de Valor (Value Objects)** imutáveis validados na construção (`Isbn`, `Barcode`, `Money`, `Email`, `StudentRegistration`, `WorkTitle`).
- Concentrar invariantes em **Raízes de Agregado** com identidade própria e controle otimista (`Work`, `Copy`, `Student` contendo `Loan[]` e `Fine[]`, `Hold`, `FineRateConfig`).
- Encapsular regras multi-fatos ou dependentes de portas puras em **Serviços de Domínio** sem I/O (`computeDueDate`, `calculateOverdueFine`, `canBorrow`).
- Implementar a máquina de estados do `Copy` (`available`, `on-loan`, `reserved`, `retired`) diretamente em métodos do agregado (`markLoaned`, `markReturned`, `withdrawFromHold`, `releaseReservation`, `retire`), recusando transições proibidas com erros tipados.

## Consequências

- Positivas: testes de domínio rodam em milissegundos sem banco nem HTTP e atingem cobertura e taxa de mutação altíssimas.
- Negativas: exige mapeamento explícito entre registros de banco (`*Record`) e agregados na infraestrutura/handlers.
