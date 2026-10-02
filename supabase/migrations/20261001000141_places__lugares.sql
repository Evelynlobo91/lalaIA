-- places: estabelecimentos e pontos de interesse de Joinville (RF09, RF10, RF11, RF12).
create schema if not exists places;
comment on schema places is 'Módulo Onde ir: lugares de Joinville (OpenStreetMap + parceiros).';
revoke all on schema places from anon, authenticated;

create table places.places (
  id                    uuid primary key default gen_random_uuid(),
  -- Origem do cadastro. 'osm' = importado do OpenStreetMap (© OpenStreetMap contributors, ODbL).
  source                text not null check (source in ('osm', 'partner')),
  -- Identificador na origem (ex.: 'node/1694859282'); garante importação idempotente.
  source_id             text,
  name                  text not null check (length(trim(name)) between 1 and 200),
  category              text not null check (category ~ '^[a-z-]{2,30}$'),
  street                text check (length(street) <= 200),
  house_number          text check (length(house_number) <= 20),
  neighborhood          text check (length(neighborhood) <= 120),
  postcode              text check (length(postcode) <= 20),
  city                  text not null default 'Joinville',
  phone                 text check (length(phone) <= 60),
  -- Só http(s): dado externo nunca vira link javascript: ou data:.
  website               text check (website is null or website ~* '^https?://[^\s]+$'),
  -- Horário no formato do OSM (ex.: 'Mo-Fr 11:00-15:00'), interpretado pelo app.
  opening_hours         text check (length(opening_hours) <= 255),
  location              extensions.geography(point, 4326) not null,
  -- Preenchido quando um parceiro edita o lugar: a reimportação do OSM não sobrescreve mais.
  edited_by_partner_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (source, source_id)
);

create index places_location_idx on places.places using gist (location);
create index places_category_idx on places.places (category);

create trigger places_updated_at
  before update on places.places
  for each row execute function platform.set_updated_at();
