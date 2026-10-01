-- events: eventos e atividades publicados por parceiros (RF13, RF14).
create schema if not exists events;
comment on schema events is 'Módulo O que fazer: eventos e atividades.';
revoke all on schema events from anon;
-- `authenticated` só para o backend agir "como o usuário" (asUser) sob RLS; o schema segue fora da API REST.
grant usage on schema events to authenticated;

create table events.events (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  -- Lugar onde acontece (módulo places), só pelo id: sem FK entre schemas de módulos (ADR 0001).
  place_id      uuid not null,
  title         text not null check (length(trim(title)) between 3 and 120),
  description   text not null check (length(trim(description)) between 10 and 2000),
  category      text not null check (category ~ '^[a-z-]{2,30}$'),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  -- Preço "a partir de", em centavos. 0 = gratuito.
  price_cents   integer not null default 0 check (price_cents between 0 and 10000000),
  status        text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '14 days'),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create index events_starts_at_idx on events.events (starts_at) where status = 'scheduled';
create index events_owner_idx on events.events (owner_id, starts_at desc);
create index events_place_idx on events.events (place_id);

create trigger events_updated_at
  before update on events.events
  for each row execute function platform.set_updated_at();

alter table events.events enable row level security;
grant select, insert on events.events to authenticated;
-- Dono não troca o dono do evento; demais colunas editáveis.
grant update (place_id, title, description, category, starts_at, ends_at, price_cents, status, cancelled_at) on events.events to authenticated;

create policy "todos leem" on events.events for select to authenticated using (true);

create policy "parceiro cria os próprios" on events.events for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select authz.has_role('partner')) and status = 'scheduled');

create policy "dono ou admin edita" on events.events for update to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_role('admin')))
  with check (owner_id = (select auth.uid()) or (select authz.has_role('admin')));
