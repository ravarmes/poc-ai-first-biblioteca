# Estratégia e Divisão das Especificações (`specs/`)

Este diretório segue o fluxo **Spec-Driven Development (SDD)** do projeto (Encontro 3, slides 32–34; [ADR-0019](../docs/adr/0019-organizacao-das-specs-por-capacidade-e-historias.md)): **toda funcionalidade nasce como especificação verificável antes do plano, das tarefas, dos testes e do código**.

---

## Por que organizamos assim (padrão de mercado)

Em projetos modernos guiados por especificação, existem três abordagens possíveis:

| Abordagem | Problema quando usada sozinha | Nossa escolha |
|---|---|---|
| 1 spec monolítica para o sistema inteiro | Mistura contextos distintos, impede entregas incrementais e vira especificação em cascata | Rejeitada |
| 1 pasta `specs/` por micro-caso de uso isolado | Fragmenta agregados compartilhados (ex.: `lendCopy`, `returnCopy` e `placeHold` atuam sobre o mesmo `Copy` e `Student`), multiplica planos redundantes e dificulta testar fluxos encadeados | Rejeitada no nível de pasta |
| **1 spec por capacidade coesa + 1 história por caso de uso + 1 fatia/teste por critério** | **Equilíbrio ideal do mercado**: cada `spec.md` fecha um ciclo de entrega e fronteira de módulo; cada `História N` isola 1 caso de uso com fluxo Cockpit + critérios `[n.n]`; cada critério gera 1 teste independente e cada história vira 1 ou mais fatias verticais (`slices/<use-case>/`) | **Adotada** |

---

## Mapa das especificações

| Pasta | Módulo / Escopo | Histórias (Casos de uso) | Estado |
|---|---|---|---|
| [`001-esqueleto-e-autenticacao/`](001-esqueleto-e-autenticacao/spec.md) | Núcleo + Autenticação (`health`, `/api/v1/auth/*`) | H1 Saúde do serviço · H2 Sessão universitária (`librarian`/`student`) e `/api/v1/auth/me` | Implementada |
| [`002-acervo-e-catalogo/`](002-acervo-e-catalogo/spec.md) | `catalog` (Acervo) | H1 Cadastrar obra · H2 Buscar e consultar obras em ≤ 1 s + `CatalogFacade` | Implementada |
| [`003-circulacao-emprestimos-reservas-multas/`](003-circulacao-emprestimos-reservas-multas/spec.md) | `circulation` (Circulação — Core) | H1 Emprestar (`lendCopy`) · H2 Devolver (`returnCopy`) · H3 Reservar e retirar/expirar (`placeHold`, `withdrawReservedCopy`, `expireHold`) · H4 Renovar (`renewLoan`) · H5 Cadastrar exemplar (`registerCopy`), quitar multa (`payFine`) e ver situação do aluno | Implementada |
| [`004-avisos-e-eventos/`](004-avisos-e-eventos/spec.md) | `notices` (Avisos) | H1 Processar `CopyReturned` v1 e despachar e-mail idempotente · H2 Listar avisos do aluno | Implementada |
| [`005-configuracao-multa-e-auditoria/`](005-configuracao-multa-e-auditoria/spec.md) | `config` + `audit` | H1 Consultar e alterar valor diário da multa com `version` (ADR-0007) · H2 Consultar trilha de auditoria (`audit.events`) | Implementada |

---

## Regra de rastreabilidade obrigatória

```text
spec.md (Critério [n.n] Dado/Quando/Então)
  ├── plan.md (decisão técnica, contratos, fronteiras e testes planejados)
  ├── tasks.md (T001..T00N em ordem: contrato → testes → domínio → fatia → UI → portões)
  └── Código & Testes
        ├── domain/<entidade>.test.ts      ← invariantes puras citando [n.n]
        ├── slices/<caso-de-uso>/*.test.ts ← comportamento da fatia citando [n.n]
        └── tests E2E / API / React        ← cenário completo citando [n.n]
```
