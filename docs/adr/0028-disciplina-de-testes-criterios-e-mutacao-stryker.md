# ADR-0028: Disciplina de testes por critério `[n.n]` e mutação ≥ 80%

- **Status**: Aceita (Encontro 4 + adaptada da SenseUp ADR-0042)
- **Data**: 2026-11-10

## Contexto e problema

Cobertura de linhas sozinha permite testes sem asserções fortes, onde bugs reais em operadores (`<` vs `<=`, `MAX_OPEN_LOANS = 3`, cálculo de multa no 14º vs 15º dia) passam despercebidos.

## Decisão

1. **Rastreabilidade por critério**: todo critério `[n.n]` das `specs/` gera teste nomeado citando `[n.n]` na suíte (domínio, fatia, SQL/integração, API ou UI).
2. **Testes nos valores-limite e casos de recusa** (Encontro 4): empréstimo #2 vs #3 (`MAX_OPEN_LOANS`), dia letivo 14 vs 15, reserva dia 3 vs dia 4, multa R$ 0,00 vs R$ 0,01, transições proibidas na máquina de estados.
3. **Portão de mutação**: configurar Stryker (`stryker.config.mjs`) sobre `packages/core/src` e `packages/modules/*/domain` + `slices` exigindo taxa mínima de mutantes mortos **≥ 80%** (`break: 80`).

## Consequências

- Positivas: valida não apenas "o caminho feliz que compila", mas a eficácia real das asserções contra bugs sutis.
- Negativas: aumenta o tempo da verificação completa de mutação (executada em comando dedicado `npm run mutation`).
