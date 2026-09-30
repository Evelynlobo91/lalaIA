-- identity: perfil do usuário e registro de aceite dos termos (RF01, RNF06, RNF11).
create schema if not exists identity;
comment on schema identity is 'Módulo Identidade & Acesso: perfis, aceite de termos e preferências.';
revoke all on schema identity from anon, authenticated;

create table identity.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on identity.profiles
  for each row execute function platform.set_updated_at();

-- Histórico append-only: cada versão de termos aceita gera uma linha, com data do servidor.
create table identity.terms_acceptances (
  user_id       uuid not null references auth.users (id) on delete cascade,
  terms_version text not null check (terms_version ~ '^\d{4}-\d{2}$'),
  accepted_at   timestamptz not null default now(),
  primary key (user_id, terms_version)
);

-- Cria perfil + aceite na MESMA transação do cadastro no Supabase Auth.
-- A API de signup do Supabase é pública: por isso a regra "sem aceite, sem conta" vive aqui,
-- e não só no formulário. A data do aceite é sempre a do servidor (a do cliente é ignorada).
create or replace function identity.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  terms_version text := meta ->> 'terms_version';
begin
  if terms_version is null then
    raise exception 'terms_not_accepted' using errcode = 'check_violation';
  end if;

  insert into identity.profiles (user_id, display_name)
  values (new.id, coalesce(nullif(trim(meta ->> 'display_name'), ''), split_part(new.email, '@', 1)));

  insert into identity.terms_acceptances (user_id, terms_version)
  values (new.id, terms_version);

  return new;
end;
$$;

revoke all on function identity.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function identity.handle_new_user();
