# ADR-0015: Estrutura de módulo em fatias verticais híbridas

- **Status**: Aceita (adaptada da SenseUp ADR-0019)
- **Data**: 2026-11-10

## Contexto e problema

Arquiteturas puramente em camadas horizontais espalham um caso de uso por quatro pastas distantes; fatias verticais puras sem camada de domínio espalham invariantes duplicadas entre handlers.

## Decisão

Adotar **fatias verticais híbridas** dentro de cada módulo (`packages/modules/<modulo>/`):

- `public/`: única porta de entrada para outros módulos e rotas internas (`/internal/v1/*`), além dos DTOs públicos e eventos publicados.
- `domain/`: agregados, entidades, objetos de valor, serviços puros de domínio, eventos e interfaces de repositório/portas externas (sem dependência de framework HTTP ou Kysely).
- `infrastructure/`: implementações Kysely/SQL, repositórios `InMemory*` de teste e adaptadores externos (ex.: ACL `academic-translator.ts` e `academic-calendar-client.ts`).
- `slices/<caso-de-uso>/`: tudo que pertence a um único caso de uso junto (`endpoint.ts`, `command.ts` ou `query.ts`, `handler.ts`, e opcionalmente `read.sql.ts`).
- `module.ts`: função `create<Modulo>Module` registrando as rotas na composição.

## Consequências

- Positivas: invariantes centralizadas no domínio (evitando duplicação) e casos de uso isolados para leitura, evolução e revisão independente por IA ou humano.
- Negativas: exige verificação contínua pelo `dependency-cruiser` para impedir atalhos entre fatias e infraestrutura ou entre módulos sem passar por `public/`.
