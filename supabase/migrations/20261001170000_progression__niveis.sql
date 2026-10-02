-- progression: níveis alcançados (#66, RF33). O nível em si é derivado do saldo de XP (código);
-- aqui fica só o registro de quando cada nível foi alcançado, para publicar LevelReached uma vez só.

-- Função genérica de histórico append-only (mesma regra do livro de XP): recusa UPDATE, DELETE e
-- TRUNCATE para qualquer papel, exceto a exclusão em cascata da conta (LGPD, pg_trigger_depth() > 1).
create or replace function progression.forbid_history_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and tg_level = 'ROW' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'progression.% é append-only: % não é permitido', tg_table_name, tg_op using errcode = 'restrict_violation';
end;
$$;

create table progression.level_ups (
  user_id    uuid not null references auth.users (id) on delete cascade,
  level      smallint not null check (level between 2 and 100),
  reached_at timestamptz not null default now(),
  -- Idempotência: cada nível é alcançado uma vez por pessoa.
  primary key (user_id, level)
);

create trigger level_ups_append_only
  before update or delete on progression.level_ups
  for each row execute function progression.forbid_history_changes();

create trigger level_ups_no_truncate
  before truncate on progression.level_ups
  for each statement execute function progression.forbid_history_changes();

-- RLS: cada pessoa só lê os próprios níveis; ninguém grava como usuário (só o backend, pelo evento de XP).
alter table progression.level_ups enable row level security;
revoke all on progression.level_ups from anon;
grant select on progression.level_ups to authenticated;

create policy "dono lê" on progression.level_ups for select to authenticated
  using (user_id = (select auth.uid()));
