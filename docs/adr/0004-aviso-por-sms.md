# ADR-0004: Aviso de exemplar reservado por SMS

- **Status**: Substituída pela [ADR-0008](0008-aviso-por-email.md)
- **Data**: 2026-11-10
- **Contexto**: Decisão histórica da Biblioteca (Encontro 1, slide 7).

## Contexto e problema

Quando um exemplar de obra reservada é devolvido ao balcão, o próximo aluno da fila precisa saber imediatamente que tem 3 dias para retirá-lo. Inicialmente cogitou-se enviar SMS por suposta taxa de leitura mais rápida.

## Decisão histórica (superada)

Adotar envio via gateway SMS como canal primário do módulo de Avisos.

## Motivo da substituição

A contratação e custo variável por mensagem de gateway SMS elevaram complexidade operacional e financeira sem necessidade comprovada, além de exigir cadastro atualizado de telefone celular na Secretaria. A decisão foi substituída pela [ADR-0008](0008-aviso-por-email.md) (e-mail institucional com idempotência), mantendo este registro apenas para preservação histórica do processo decisório.
