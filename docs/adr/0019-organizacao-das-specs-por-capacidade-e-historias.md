# ADR-0019: Organização das specs por capacidade e histórias por caso de uso

- **Status**: Aceita (alinhada ao Encontro 3 e à SenseUp ADR-0044)
- **Data**: 2026-11-10

## Contexto e problema

Ao estruturar um projeto com Spec-Driven Development (SDD), surge a questão de como granular os documentos em `specs/`:

1. **Uma spec única para o projeto todo**: cria documentos gigantes, mistura domínios e dificulta revisão e testes independentes.
2. **Uma pasta `specs/` por caso de uso isolado**: obriga repetir contexto de agregados compartilhados (ex.: `lendCopy`, `returnCopy`, `renewLoan`, `placeHold` e `withdrawReservedCopy` compartilham a máquina de estados de `Copy` e as invariantes de `Student`).
3. **Uma spec por módulo com todas as histórias misturadas sem corte**: pode confundir fronteiras quando um módulo cresce muito ou atravessa capacidades diferentes.

## Decisão

Adotar o padrão híbrido de mercado (User Story Mapping + Spec Kit + Vertical Slices):

1. **Pasta `specs/00N-<capacidade>/`** = **uma capacidade coesa / fronteira de entrega** (alinhada aos módulos e entregáveis: `001` Esqueleto e Autenticação, `002` Acervo, `003` Circulação, `004` Avisos e Eventos, `005` Configuração de Multa e Auditoria).
2. **Dentro de `spec.md`, `### História N` = um caso de uso** (com prioridade, fluxo textual Cockpit — principal, alternativos e exceções — e critérios numerados `[n.n]` no formato Dado / Quando / Então).
3. **No código (`slices/<use-case>/`) e nos testes** = **uma fatia vertical por caso de uso** e **um teste por critério `[n.n]`**, permitindo que um PR/MR corresponda exatamente a uma história ou fatia verificada do começo ao fim.

## Consequências

- Positivas: evita tanto monolitos de spec quanto proliferação de pastas fragmentadas; mantém rastreabilidade direta `Critério [n.n] → Teste → Fatia`.
- Negativas: especificações de módulos muito ricos (como `003-circulacao`) exigem manutenção disciplinada da matriz Critério → Teste no `plan.md`.
