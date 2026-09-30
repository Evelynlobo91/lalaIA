-- platform: extensões e utilitários compartilhados por todos os módulos.
-- Convenção (docs/database.md): cada módulo cria o próprio schema na sua primeira migration.

create extension if not exists postgis with schema extensions;   -- consultas espaciais (RF12, RF30)
create extension if not exists unaccent with schema extensions;  -- busca sem acento (RF04)
create extension if not exists pg_trgm with schema extensions;   -- busca aproximada (RF04)

create schema if not exists platform;
comment on schema platform is 'Kernel compartilhado do banco: utilitários sem regra de negócio.';

-- Mantém updated_at em dia. Uso: create trigger ... before update ... execute function platform.set_updated_at();
create or replace function platform.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Schemas de módulo não são expostos pela API REST do Supabase: o acesso passa pelo backend.
revoke all on schema platform from anon, authenticated;
