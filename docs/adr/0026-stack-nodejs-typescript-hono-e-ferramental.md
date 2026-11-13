# ADR-0026: Stack Backend — Node.js 22+, TypeScript estrito e Hono

- **Status**: Aceita (Solicitação do projeto — stack única)
- **Data**: 2026-11-10

## Contexto e problema

Diferente da PoC SenseUp original (Bun + Go + .NET para benchmark multi-stack), o usuário pediu especificamente uma única implementação de backend em **Node.js + TypeScript**.

## Decisão

- Runtime: **Node.js 22 LTS** com suporte nativo/ES Modules (`"type": "module"`) e executor `tsx` em dev/migrations.
- Linguagem: **TypeScript 5.8+** (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`).
- Framework HTTP: **Hono 4** com **`@hono/node-server`**, preservando a mesma API limpa de roteadores, contexto e `app.request(...)` usada nos padrões da SenseUp.
- Testes e mutação: **Vitest** + **`@stryker-mutator/core` / `@stryker-mutator/vitest-runner`**.
- Qualidade estática: **`dependency-cruiser`** para fronteiras e ciclos + `tsc --noEmit` + lint OpenAPI (`@redocly/cli`).

## Consequências

- Positivas: zero dependência de Bun/Docker na máquina Windows do projeto, mantendo exatamente o mesmo estilo idiomático de `Hono` + `Kysely` + `Zod` da PoC SenseUp.
- Negativas: exige compilação/transpilação padrão (`tsx` ou `tsc`) no Node em vez do runner embutido do Bun.
