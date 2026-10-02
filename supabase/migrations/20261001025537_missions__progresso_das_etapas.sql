-- missions: etapas concluídas (RF29, RF30). Append-only: o progresso é derivado destas linhas.
create table missions.step_completions (
  id               uuid primary key default gen_random_uuid(),
  user_mission_id  uuid not null references missions.user_missions (id) on delete cascade,
  step_id          uuid not null references missions.mission_steps (id) on delete cascade,
  -- Redundante com user_missions.user_id, para a RLS ficar simples e rápida.
  user_id          uuid not null references auth.users (id) on delete cascade,
  completed_at     timestamptz not null default now(),
  -- Uso único por usuário/etapa: a mesma etapa nunca conta duas vezes (anti-fraude e idempotência).
  unique (user_mission_id, step_id)
);

create index step_completions_user_idx on missions.step_completions (user_id, user_mission_id);

alter table missions.step_completions enable row level security;
-- Sem UPDATE/DELETE: uma etapa concluída não volta atrás.
grant select, insert on missions.step_completions to authenticated;

create policy "dono lê" on missions.step_completions for select to authenticated
  using (user_id = (select auth.uid()));

-- Só na própria missão aceita e ainda ativa, e só com uma etapa DESSA missão.
create policy "dono conclui etapa da própria missão" on missions.step_completions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from missions.user_missions um
      join missions.mission_steps s on s.mission_id = um.mission_id
      where um.id = user_mission_id and um.user_id = (select auth.uid()) and um.status = 'active' and s.id = step_id
    )
  );

-- Concluir a missão: só a própria, e só quando todas as etapas foram concluídas.
grant update (status, completed_at) on missions.user_missions to authenticated;

create policy "dono conclui a missão com todas as etapas" on missions.user_missions for update to authenticated
  using (user_id = (select auth.uid()) and status = 'active')
  with check (
    user_id = (select auth.uid())
    and status = 'completed'
    and (select count(*) from missions.step_completions c where c.user_mission_id = user_missions.id)
      = (select count(*) from missions.mission_steps s where s.mission_id = user_missions.mission_id)
  );
