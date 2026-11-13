# ADR-0005: Busca no acervo executada no próprio banco

- **Status**: Aceita
- **Data**: 2026-11-10
- **Contexto**: Fundação da Biblioteca (Encontro 1, slide 7) + RNF-01 (busca ≤ 1 s).

## Contexto e problema

O catálogo precisa responder pesquisas por título, autor, assunto e ISBN em até 1 segundo (RNF-01). Cogitou-se introduzir um motor de busca separado (Elasticsearch/OpenSearch) desde o início.

## Decisão

Executar a busca diretamente no PostgreSQL dentro do schema `catalog` utilizando colunas normalizadas, índices B-tree/GIN (`ILIKE` / busca textual nativa do PostgreSQL) e paginação por cursor opaco, mantendo um único repositório de dados para o Acervo.

## Consequências

- Positivas: elimina sincronização eventual de índice externo, reduz infraestrutura operacional na PoC e atende com folga o critério de ≤ 1 s para catálogos universitários típicos.
- Negativas: caso o catálogo escale para dezenas de milhões de registros com relevância semântica complexa, uma camada dedicada poderá ser avaliada atrás da mesma interface `WorkRepository`.
