# ADR-0021: Concorrência otimista com `version` no corpo

- **Status**: Aceita (adaptada da SenseUp ADR-0025)
- **Data**: 2026-11-10

## Contexto e problema

Duas bibliotecárias no balcão (ou dois cliques concorrentes) podem ler o mesmo exemplar, conta de aluno ou tabela de multa simultaneamente e tentar alterar com base em estado obsoleto ("lost update").

## Decisão

- Entidades mutáveis concorrentes (`Work`, `Copy`, `Student`, `FineRateConfig`) carregam coluna inteira `version` iniciando em `1` e incrementada em `1` a cada mutação efetiva.
- Comandos de alteração exigem `version` no corpo (ou versão atual do registro lido na operação); os repositórios executam `UPDATE ... SET ..., version = version + 1 WHERE id = $1 AND version = $2`.
- Quando `0` linhas são afetadas para registro existente (ou o agregado detecta divergência), a API responde `409 /problems/version-conflict` contendo `currentVersion`, e o frontend oferece botão explícito para recarregar o registro.

## Consequências

- Positivas: impede empréstimo simultâneo do mesmo exemplar ou perda silenciosa de alteração da tabela de multa sem locks pessimistas longos.
- Negativas: clientes concorrentes recebem `409` e precisam recarregar antes de reenviar.
