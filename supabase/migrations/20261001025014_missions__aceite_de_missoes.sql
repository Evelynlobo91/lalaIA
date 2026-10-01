-- missions: aceite de missão pelo usuário (RF28). Uma instância por usuário e missão.
create table missions.user_missions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  mission_id    uuid not null references missions.missions (id) on delete cascade,
  status        text not null default 'active' check (status in ('active', 'completed')),
  accepted_at   timestamptz not null default now(),
  completed_at  timestamptz,
  unique (user_id, mission_id),
  check ((status = 'completed') = (completed_at is not null))
);

create index user_missions_user_idx on missions.user_missions (user_id, status, accepted_at desc);
create index user_missions_mission_idx on missions.user_missions (mission_id);

alter table missions.user_missions enable row level security;
grant select, insert on missions.user_missions to authenticated;

-- Cada pessoa só vê e aceita as próprias missões, sempre como ativa.
create policy "dono lê" on missions.user_missions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "dono aceita missão ativa" on missions.user_missions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'active'
    and completed_at is null
    and exists (select 1 from missions.missions m where m.id = mission_id and m.status = 'active' and now() between m.starts_at and m.ends_at)
  );

-- Já tem participantes? Security definer: o dono da missão não lê os aceites de outras pessoas (RLS),
-- mas precisa saber se as etapas já estão travadas.
create or replace function missions.has_participants(p_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from missions.user_missions where mission_id = p_mission_id);
$$;
revoke all on function missions.has_participants(uuid) from public, anon;
grant execute on function missions.has_participants(uuid) to authenticated;

-- Depois do primeiro aceite, as etapas não mudam (quem aceitou joga a missão que viu).
drop policy "dono ou admin cria etapas" on missions.mission_steps;
drop policy "dono ou admin altera etapas" on missions.mission_steps;
drop policy "dono ou admin remove etapas" on missions.mission_steps;

create policy "dono ou admin cria etapas" on missions.mission_steps for insert to authenticated
  with check (
    not missions.has_participants(mission_id)
    and exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_role('admin'))))
  );

create policy "dono ou admin altera etapas" on missions.mission_steps for update to authenticated
  using (
    not missions.has_participants(mission_id)
    and exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_role('admin'))))
  )
  with check (exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_role('admin')))));

create policy "dono ou admin remove etapas" on missions.mission_steps for delete to authenticated
  using (
    not missions.has_participants(mission_id)
    and exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_role('admin'))))
  );

-- E o XP também não muda (vale para qualquer papel).
create or replace function missions.lock_xp_after_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.xp <> old.xp and missions.has_participants(old.id) then
    raise exception 'missão já aceita: o XP não pode mudar' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger missions_lock_xp
  before update of xp on missions.missions
  for each row execute function missions.lock_xp_after_acceptance();
