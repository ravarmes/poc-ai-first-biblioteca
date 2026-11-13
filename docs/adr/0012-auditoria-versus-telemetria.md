# ADR-0012: Separação entre auditoria de negócio e telemetria

- **Status**: Aceita (adaptada da SenseUp ADR-0013)
- **Data**: 2026-11-10

## Contexto e problema

Misturar logs de leitura HTTP com eventos de responsabilidade legal/financeira (empréstimos, multas, quitações e alteração de tarifa da ADR-0007) polui a auditoria, infla tabelas e dificulta a prestação de contas.

## Decisão

- **Auditoria (`audit.events`)**: registra exclusivamente **mutações de estado** relevantes de negócio e **negações de autorização (`authz.denied`)**, estruturadas com ator, recurso, ação, resultado, `changes` (`before` / `after`), `requestId` e `traceId`.
- **Telemetria (logs estruturados e spans)**: registra toda requisição HTTP, tempo de execução (inclusive o SLA ≤ 1 s da busca no acervo), spans de repositório e falhas técnicas, **nunca** registrando dados pessoais sensíveis (e-mail ou nome completo em spans). Leituras simples (`GET`) nunca escrevem em `audit.events`.

## Consequências

- Positivas: trilha de auditoria enxuta, legível pela bibliotecária na UI e aderente à LGPD na telemetria.
- Negativas: análises de frequência de busca dependem de telemetria/logs, não da tabela de auditoria.
