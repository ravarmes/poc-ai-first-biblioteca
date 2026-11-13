# ADR-0003: Banco relacional PostgreSQL

- **Status**: Aceita
- **Data**: 2026-11-10
- **Contexto**: Fundação da Biblioteca (Encontro 1, slide 7).

## Contexto e problema

A Circulação exige transações ACID locais (ex.: registrar devolução no `Copy`, fechar `Loan`, calcular e gravar `Fine` e reservar para o primeiro `Hold` sem condição de corrida), controle de versão otimista com precisão numérica e isolamento de permissões por módulo.

## Decisão

Adotar **PostgreSQL 18** como banco único do monólito modular, com isolamento lógico e de segurança por **schema** e **role** dedicada para cada módulo ([ADR-0016](0016-fronteira-no-banco-schema-e-role-por-modulo.md)).

## Consequências

- Positivas: transações atômicas nativas no módulo, índices eficientes para busca no acervo e controle granular por role/schema sem necessidade de bancos físicos separados na PoC.
- Negativas: proíbe `JOIN` e chaves estrangeiras cruzando schemas de módulos diferentes; integridade referencial entre contextos é mantida na camada de aplicação e por eventos.
