-- progression: conquistas desbloqueadas (#67, RF32). As regras moram no código (catálogo de estratégias);
-- aqui fica só o desbloqueio, append-only e único por pessoa e conquista.

create table progression.achievements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- Id estável da regra no catálogo do código (ex.: 'primeira-missao').
  achievement_id text not null check (achievement_id ~ '^[a-z0-9-]{1,60}$'),
  unlocked_at    timestamptz not null default now(),
  -- Idempotência: cada conquista é desbloqueada uma vez por pessoa.
  unique (user_id, achievement_id)
);

create trigger achievements_append_only
  before update or delete on progression.achievements
  for each row execute function progression.forbid_history_changes();

create trigger achievements_no_truncate
  before truncate on progression.achievements
  for each statement execute function progression.forbid_history_changes();

-- RLS: cada pessoa só lê as próprias conquistas; ninguém grava como usuário (só o backend, pelos eventos).
alter table progression.achievements enable row level security;
revoke all on progression.achievements from anon;
grant select on progression.achievements to authenticated;

create policy "dono lê" on progression.achievements for select to authenticated
  using (user_id = (select auth.uid()));

-- Bônus de XP das conquistas pelo próprio livro-razão: novo motivo 'achievement'
-- (source_id = id do desbloqueio, então o bônus é creditado uma vez só).
alter table progression.xp_transactions drop constraint xp_transactions_reason_check;
alter table progression.xp_transactions add constraint xp_transactions_reason_check
  check (reason in ('mission_step', 'mission_completed', 'achievement'));
