# ADR-0007: Valor diário da multa em tabela configurável e auditada

- **Status**: Aceita
- **Data**: 2026-11-10
- **Contexto**: Fundação da Biblioteca (Encontro 1, slide 7) e RN-04.

## Contexto e problema

Deixar a multa diária (R$ 1,00 por dia de atraso) fixada como constante no código obrigaria um novo deploy toda vez que a universidade reajustar a tarifa anual. Ao mesmo tempo, alterações sem registro abririam brecha para fraudes ou divergências financeiras.

## Decisão

Manter o valor diário da multa em uma **tabela configurável** no banco (`config.fine_rates`, valor inicial **100 centavos = R$ 1,00 / dia**), gerida por fatia própria (`updateFineRate`) com controle otimista (`version`) e **registro obrigatório na auditoria** (`audit.events` com ator, data, valor anterior e valor novo).

Na apuração de devoluções, a Circulação consulta o valor vigente via fachada de `config` (`FineRateFacade.currentDailyRateCents()`) e grava o valor congelado no registro da multa (`Fine`) criada no momento da devolução, garantindo que reajustes futuros não alterem multas passadas.

## Consequências

- Positivas: flexibilidade administrativa sem deploy e rastreabilidade completa de quem alterou a tarifa, quando e de quanto para quanto.
- Negativas: requer leitura transacional da configuração durante o preparo (`prepare`) de `returnCopy` para evitar chamadas aninhadas entre schemas diferentes.
