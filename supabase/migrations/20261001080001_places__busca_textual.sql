-- places: índice de busca textual pelo nome (RF04), em português e sem acento.
-- A consulta precisa usar exatamente a mesma expressão para aproveitar o índice
-- (veja src/shared/db/text-search.ts e docs/discovery.md).
create index places_name_search_idx on places.places
  using gin ((to_tsvector('platform.busca', name) || to_tsvector('platform.busca_simples', name)));
