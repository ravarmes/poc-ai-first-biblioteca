# ADR-0027: Stack Frontend — React 19, Vite, Tailwind, TanStack e i18next pt-BR

- **Status**: Aceita (adaptada das ADRs 0032–0036 da SenseUp para stack única React)
- **Data**: 2026-11-10

## Contexto e problema

O frontend precisa atender os fluxos da **Bibliotecária** (balcão de empréstimo/devolução/retirada/multas, catálogo/exemplares, tabela de multa e auditoria) e do **Aluno** (busca no acervo, empréstimos em aberto, multas, reservas e avisos) com excelente testabilidade e UX clara em português.

## Decisão

Adotar exatamente as escolhas de React da PoC SenseUp em `apps/web-react`:

- **React 19 + Vite + TypeScript estrito**.
- **Tailwind CSS v4 + primitivos acessíveis estilo shadcn/ui** (componentes próprios reutilizáveis em `src/components/ui/`).
- **TanStack Router** (rotas organizadas e tipadas, com área do Aluno e área do Balcão/Bibliotecária) e **TanStack Query** (cache, paginação por cursor "Carregar mais", invalidação explícita pós-mutação).
- **Validação de formulários com Zod** compartilhando esquemas de `@biblioteca/contract` e tratamento explícito de **`409 version-conflict`** (`VersionConflict` com recarga).
- **`i18next` + `react-i18next`** com catálogo único em `src/locales/pt-BR.json`.
- **Vitest + React Testing Library + jsdom + MSW** e atributos **`data-testid`** estáveis para cada interação crítica.

## Consequências

- Positivas: feedback imediato ao usuário em conflitos, validações de campo e erros de regra de negócio RFC 9457, com suíte de UI totalmente determinística via MSW.
- Negativas: requer sincronismo de chaves `pt-BR.json` e contratos `@biblioteca/contract`.
