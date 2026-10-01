-- missions: missões urbanas com etapas ordenadas, criadas por parceiros e admins (RF26).
create schema if not exists missions;
comment on schema missions is 'Módulo Missões: missões urbanas, aceites e etapas concluídas.';
revoke all on schema missions from anon;
-- `authenticated` só para o backend agir "como o usuário" (asUser) sob RLS; o schema segue fora da API REST.
grant usage on schema missions to authenticated;

create table missions.missions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  title        text not null check (length(trim(title)) between 3 and 120),
  description  text not null check (length(trim(description)) between 10 and 2000),
  -- XP total da missão, dividido entre as etapas e o bônus de conclusão (domain/mission.ts: xpSplit).
  xp           integer not null check (xp between 10 and 1000),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'active' check (status in ('active', 'archived')),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '366 days'),
  check ((status = 'archived') = (archived_at is not null))
);

create index missions_available_idx on missions.missions (ends_at, starts_at) where status = 'active';
create index missions_owner_idx on missions.missions (owner_id, created_at desc);

create trigger missions_updated_at
  before update on missions.missions
  for each row execute function platform.set_updated_at();

create table missions.mission_steps (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid not null references missions.missions (id) on delete cascade,
  position    smallint not null check (position between 1 and 10),
  title       text not null check (length(trim(title)) between 3 and 80),
  -- Lugar da etapa (módulo places), só pelo id: sem FK entre schemas de módulos (ADR 0001).
  place_id    uuid not null,
  -- Estratégia de validação (StepValidator). Novos tipos (ex.: 'gps') entram ampliando este check.
  validation  text not null default 'qr' check (validation in ('qr')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (mission_id, position)
);

create index mission_steps_place_idx on missions.mission_steps (place_id);

create trigger mission_steps_updated_at
  before update on missions.mission_steps
  for each row execute function platform.set_updated_at();

-- RLS: todos leem; parceiro/admin criam em nome próprio; só o dono (ou admin) altera.
alter table missions.missions enable row level security;
grant select, insert on missions.missions to authenticated;
-- O dono não transfere a missão (owner_id fora do grant de UPDATE).
grant update (title, description, xp, starts_at, ends_at, status, archived_at) on missions.missions to authenticated;

create policy "todos leem" on missions.missions for select to authenticated using (true);

create policy "parceiro ou admin cria a própria" on missions.missions for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and ((select authz.has_role('partner')) or (select authz.has_role('admin')))
    and status = 'active'
  );

create policy "dono ou admin edita" on missions.missions for update to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_role('admin')))
  with check (owner_id = (select auth.uid()) or (select authz.has_role('admin')));

alter table missions.mission_steps enable row level security;
grant select, insert, delete on missions.mission_steps to authenticated;
grant update (position, title, place_id, validation) on missions.mission_steps to authenticated;

create policy "todos leem" on missions.mission_steps for select to authenticated using (true);

-- Etapas só na própria missão (ou como admin). Se o lugar é do parceiro, quem confere é o caso de uso,
-- pela API pública de places (sem junção entre schemas).
create policy "dono ou admin cria etapas" on missions.mission_steps for insert to authenticated
  with check (exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_role('admin')))));

create policy "dono ou admin altera etapas" on missions.mission_steps for update to authenticated
  using (exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_role('admin')))))
  with check (exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_role('admin')))));

create policy "dono ou admin remove etapas" on missions.mission_steps for delete to authenticated
  using (exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_role('admin')))));
