# Plano de Implementação: [TÍTULO]

**Spec**: `spec.md` (na mesma pasta da capacidade)
**Status**: Aprovado para execução

## 1. Resumo técnico e aderência à Constituição

- Contratos afetados (`contracts/openapi/`, `contracts/db/`)
- ADRs aplicadas

## 2. Estrutura no monorepo e fronteiras

- Camadas dentro do módulo (`public/`, `domain/`, `infrastructure/`, `slices/<use-case>/`, `module.ts`)
- Permissões PostgreSQL e isolamento de schemas

## 3. Estratégia de testes (Pirâmide + Mutação)

- Mapeamento `Critério [n.n] → Domínio / Fatia / SQL / API-React`
- Valores-limite e alvos de mutação Stryker (≥ 80%)
