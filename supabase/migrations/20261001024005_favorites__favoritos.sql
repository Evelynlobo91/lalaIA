-- favorites: lugares e eventos salvos pelo usuário (RF07, RF08).
create schema if not exists favorites;
comment on schema favorites is 'Módulo Favoritos: lugares e eventos salvos.';
revoke all on schema favorites from anon;
-- `authenticated` só para o backend agir "como o usuário" (asUser) sob RLS; o schema segue fora da API REST.
grant usage on schema favorites to authenticated;

create table favorites.favorites (
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Favorito polimórfico: o módulo não conhece places nem events. Só o id, sem FK entre schemas (ADR 0001).
  entity_type text not null check (entity_type in ('place', 'event')),
  entity_id   uuid not null,
  created_at  timestamptz not null default now(),
  -- Um favorito por usuário e item: favoritar de novo não duplica (idempotente).
  primary key (user_id, entity_type, entity_id)
);

-- "Meus favoritos": do mais recente para o mais antigo.
create index favorites_user_recent_idx on favorites.favorites (user_id, created_at desc);

alter table favorites.favorites enable row level security;
revoke all on favorites.favorites from anon;
-- Sem UPDATE: um favorito só é criado ou apagado.
grant select, insert, delete on favorites.favorites to authenticated;

create policy "dono lê os próprios" on favorites.favorites for select to authenticated
  using (user_id = (select auth.uid()));

create policy "dono cria os próprios" on favorites.favorites for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "dono apaga os próprios" on favorites.favorites for delete to authenticated
  using (user_id = (select auth.uid()));
