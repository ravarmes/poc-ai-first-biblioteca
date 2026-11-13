# ADR-0030: Idioma dos identificadores, código e documentação

- **Status**: Aceita (derivada diretamente da SenseUp ADR-0052 e regras do projeto)
- **Data**: 2026-11-10

## Contexto e problema

Misturar português e inglês aleatoriamente em nomes de classes, tabelas e rotas dificulta a leitura do código e inconsistência entre contratos, enquanto escrever documentação/UI em inglês atrapalha o time e o negócio em português.

## Decisão

1. **Em inglês**: todos os identificadores de código (`Work`, `Copy`, `Student`, `Loan`, `Fine`, `Hold`, `lendCopy`, `returnCopy`, `renewLoan`, `placeHold`, `withdrawReservedCopy`, `payFine`, `CatalogFacade`, `CopyReturned`), caminhos de arquivos/pastas de código, rotas `/api/v1/...`, campos JSON, códigos `/problems/<codigo>`, schemas/tabelas/colunas SQL e ações de autorização.
2. **Exceção da camada anticorrupção (ACL)**: exclusivamente nos adaptadores externos de `Secretaria` (`discente`, `ra`, `nome_civil`, `sit_matricula`, `cod_curso`) e `Calendário` (`dias_letivos`), os nomes originais do fornecedor permanecem na interface crua para tornar explícita a tradução para o domínio em inglês (`AcademicStudent`, `SchoolCalendar`).
3. **Em português (`pt-BR`)**: toda documentação (`README.md`, `docs/`, `specs/`, ADRs), comentários de código, detalhes em `ProblemError`, catálogo de textos da UI (`pt-BR.json`) e descrições de suítes de teste (`describe` / `test`).

## Consequências

- Positivas: código idiomático uniforme com o glossário do `AGENTS.md` e documentação/experiência natural em português.
- Negativas: exige atenção ao traduzir termos novos antes de codificá-los (`AGENTS.md`, tabela de vocabulário).
