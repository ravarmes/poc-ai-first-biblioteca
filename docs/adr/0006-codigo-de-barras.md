# ADR-0006: Identificação de exemplar físico por código de barras

- **Status**: Aceita
- **Data**: 2026-11-10
- **Contexto**: Fundação da Biblioteca (Encontro 1, slide 7).

## Contexto e problema

Uma mesma obra (`Work`, identificada por título/ISBN no Acervo) possui múltiplos exemplares físicos (`Copy`) na estante. No balcão, a bibliotecária precisa identificar sem ambiguidade qual exemplar está saindo ou retornando.

## Decisão

Todo exemplar físico cadastrado na Circulação recebe obrigatoriamente um identificador de **código de barras** (`Barcode`) único em todo o acervo físico, validado como Objeto de Valor no domínio (não vazio, normalizado em maiúsculas/sem espaços nas pontas, padrão alfanumérico/hífen entre 4 e 32 caracteres) e indexado por restrição `UNIQUE` em `circulation.copies`.

## Consequências

- Positivas: operação instantânea com leitor de código de barras ou digitação direta no balcão; rastreabilidade individual de estado e histórico de empréstimo por unidade física.
- Negativas: exige registro explícito de cada unidade física e tratamento de erro de duplicidade (`409 barcode-taken`).
