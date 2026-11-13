# ADR-0029: Fluxo Spec Kit adaptado e verificações automáticas AI-First

- **Status**: Aceita (adaptada das SenseUp ADRs 0043–0046)
- **Data**: 2026-11-10

## Contexto e problema

Para manter previsibilidade em desenvolvimento assistido por IA, especificações, planos, tarefas, verificadores de arquitetura e revisão humana/de agente precisam seguir um fluxo repetível.

## Decisão

- Manter `.specify/presets/biblioteca/` com templates adaptados (`spec-template.md`, `plan-template.md`, `tasks-template.md`).
- Toda entrega segue a ordem: **Spec (`spec.md`) → Contrato (`contracts/`) → Plano (`plan.md`) → Tarefas (`tasks.md`) → Testes (`[n.n]`) → Código → Portões → Revisão independente (`revisor-codigo`)**.
- Incluir verificador automatizado em `tools/docs-check/` garantindo zero links quebrados em Markdown e diagramas Mermaid válidos (inclusive sem `;` em mensagens `sequenceDiagram`).

## Consequências

- Positivas: documentação sempre viva e acoplada às verificações de CI/local.
- Negativas: exige disciplina de atualização quando um arquivo muda de caminho.
