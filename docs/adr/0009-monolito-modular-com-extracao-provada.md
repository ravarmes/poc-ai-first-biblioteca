# ADR-0009: Monólito modular com extração provada por configuração

- **Status**: Aceita (adaptada da SenseUp ADR-0002)
- **Data**: 2026-11-10

## Contexto e problema

Microsserviços prematuros multiplicam latência de rede, transações distribuídas e custo operacional numa equipe pequena. Contudo, um monólito sem fronteiras degrada em acoplamento ("big ball of mud").

## Decisão

Estruturar o backend como **monólito modular** em monorepo npm (`packages/modules/{catalog,circulation,notices,config,audit}`), composto em `apps/api-node/src/composition.ts`.

A variável de ambiente `MODULES` controla quais módulos sobem no processo (`MODULES=*` por padrão, ou subconjunto como `MODULES=circulation,notices` / `MODULES=catalog`). Toda comunicação entre módulos passa exclusivamente pelas fachadas em `public/`, com adaptador substituível entre chamada **em processo** (padrão) e **HTTP interno** (`/internal/v1/...`), exatamente como na PoC da SenseUp.

## Consequências

- Positivas: deploy único e simples no dia a dia com garantia estrutural de que qualquer módulo (ex.: `catalog`) pode ser extraído sem alterar o domínio.
- Negativas: exige que `prepare` nas fatias chame fachadas externas antes de abrir a transação do módulo para não segurar conexão do banco.
