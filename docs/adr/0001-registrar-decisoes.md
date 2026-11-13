# ADR-0001: Registrar decisões arquiteturais no repositório

- **Status**: Aceita
- **Data**: 2026-11-10
- **Contexto**: Decisão fundacional da Biblioteca (Encontro 1, slide 7).

## Contexto e problema

Sem memória escrita de por que um padrão ou tecnologia foi escolhido, novos desenvolvedores e agentes de IA tendem a reabrir debates já fechados ou contradizer premissas anteriores (ex.: trocar banco, mudar estratégia de aviso ou duplicar tabelas entre contextos).

## Opções consideradas

1. Decisões apenas em reuniões ou wikis desconexas do código.
2. ADRs curtas em Markdown (`docs/adr/NNNN-titulo.md`) versionadas junto ao código e revisadas em conjunto com specs e contratos.

## Decisão

Adotar registros **MADR** numerados sequencialmente em `docs/adr/`. Uma ADR aceita só muda por substituição explícita (ex.: [ADR-0004](0004-aviso-por-sms.md) substituída pela [ADR-0008](0008-aviso-por-email.md)), preservando o histórico de decisão.

## Consequências

- Positivas: contexto durável legível por humanos e agentes de IA na própria árvore de arquivos.
- Negativas: requer disciplina para criar nova ADR sempre que uma decisão transversal surgir.
