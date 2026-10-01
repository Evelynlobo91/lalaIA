-- platform: configurações de busca textual em português, sem acento (RF04).
-- Compartilhadas pelos módulos: cada um cria o próprio índice na sua tabela, sem join entre schemas.
--
-- `to_tsvector('platform.busca', texto)` é IMMUTABLE (a configuração é uma constante), então pode ser
-- usado em índice de expressão, ao contrário de chamar `unaccent()` direto (que é só STABLE).
--
-- Duas configurações, usadas juntas (vetor = busca || busca_simples; cada termo casa com qualquer uma):
-- - platform.busca: unaccent → portuguese_stem (radical, minúsculas e stopwords):
--   "restaurantes" acha "Restaurante", "museu" acha "Museus".
-- - platform.busca_simples: unaccent → simple (palavra inteira, sem radical): garante o prefixo enquanto
--   a pessoa digita ("pizzari" acha "Pizzaria", o que o radical sozinho não acha: pizzar ≠ pizz).
create text search configuration platform.busca (copy = pg_catalog.portuguese);
alter text search configuration platform.busca
  alter mapping for hword, hword_part, word
  with extensions.unaccent, pg_catalog.portuguese_stem;

create text search configuration platform.busca_simples (copy = pg_catalog.simple);
alter text search configuration platform.busca_simples
  alter mapping for hword, hword_part, word
  with extensions.unaccent, pg_catalog.simple;

comment on text search configuration platform.busca is
  'Busca em português sem acento (unaccent + portuguese_stem). Use junto de platform.busca_simples.';
comment on text search configuration platform.busca_simples is
  'Busca sem acento e sem radical (unaccent + simple), para prefixo enquanto se digita. Use junto de platform.busca.';
