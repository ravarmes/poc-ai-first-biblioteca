# ADR-0023: Integrações externas — ACL da Secretaria e Conformista do Calendário

- **Status**: Aceita (Encontro 1 slides 22/24 e Encontro 2 slide 30)
- **Data**: 2026-11-10

## Contexto e problema

A Circulação depende de dois sistemas externos à biblioteca:
1. A **Secretaria Acadêmica**, cujo payload (`discente { ra, nome_civil, sit_matricula, cod_curso }`) usa vocabulário legado sujeito a alterações.
2. O **Calendário Acadêmico**, cuja lista oficial de dias letivos (`{ dias_letivos: string[] }`) determina a data de devolução em +14 dias letivos (RN-05).

## Decisão

1. **Secretaria → Camada Anticorrupção (ACL)**: definir a porta de domínio `AcademicRegistryPort` devolvendo o modelo limpo `AcademicStudent { registration, fullName, active, courseCode, email }` e isolar os campos crus da Secretaria (`discente`, `ra`, `nome_civil`, `sit_matricula`, `cod_curso`) em `infrastructure/secretaria-acl/`.
2. **Calendário → Conformista**: definir a porta `SchoolCalendarPort` aceitando diretamente a lista de datas letivas no formato do Calendário em `computeDueDate(loanDate, SCHOOL_LOAN_DAYS, calendar)`, evitando camada de tradução desnecessária para um dado tabular estável.

## Consequências

- Positivas: alterações de status interno da Secretaria (`MATRICULADO` vs `ATIVO` vs `TRANCADO`) exigem ajuste em um único arquivo tradutor, preservando intactos os agregados e testes do domínio.
- Negativas: se o Calendário mudar radicalmente sua representação no futuro, o ponto de adaptação será atualizado no adaptador conformista.
