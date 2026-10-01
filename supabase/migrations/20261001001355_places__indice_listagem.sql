-- places: paginação por cursor (nome, id) sem varrer a tabela inteira (RF09, RNF03).
-- Ordenação em português (acentos e maiúsculas tratados) via collation ICU do próprio Postgres.
create collation if not exists places.pt_br (provider = icu, locale = 'pt-BR');

create index places_name_id_idx on places.places ((name collate places.pt_br), id);
