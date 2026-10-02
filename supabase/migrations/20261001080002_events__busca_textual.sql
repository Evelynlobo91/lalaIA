-- events: índice de busca textual por título e descrição (RF04), em português e sem acento.
-- A consulta precisa usar exatamente a mesma expressão para aproveitar o índice
-- (veja src/shared/db/text-search.ts e docs/discovery.md).
create index events_text_search_idx on events.events
  using gin ((to_tsvector('platform.busca', title || ' ' || description) || to_tsvector('platform.busca_simples', title || ' ' || description)));
