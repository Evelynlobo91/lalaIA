-- missions: etapa validada por check-in GPS com geofence (#61, RF30).
-- Tipos de validação: 'qr' (QR do balcão), 'gps' (check-in no raio) e 'qr_gps' (os dois).
alter table missions.mission_steps drop constraint mission_steps_validation_check;
alter table missions.mission_steps add constraint mission_steps_validation_check check (validation in ('qr', 'gps', 'qr_gps'));

-- Geofence da etapa: raio em volta do lugar e permanência mínima no raio (só nas etapas com GPS).
alter table missions.mission_steps
  add column geofence_radius_m smallint check (geofence_radius_m between 30 and 300),
  add column dwell_minutes smallint check (dwell_minutes between 0 and 30);

alter table missions.mission_steps add constraint mission_steps_geofence_check check (
  (validation = 'qr') = (geofence_radius_m is null)
  and (geofence_radius_m is null) = (dwell_minutes is null)
  -- Em "QR + GPS" o QR do balcão já comprova a presença: sem permanência.
  and (validation <> 'qr_gps' or dwell_minutes = 0)
);

grant update (geofence_radius_m, dwell_minutes) on missions.mission_steps to authenticated;

-- Tentativas de check-in: append-only. A coordenada NUNCA é gravada (LGPD), só o resultado e a
-- distância arredondada para 10 m. Serve ao limite de tentativas e à permanência mínima.
create table missions.geofence_checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  step_id       uuid not null references missions.mission_steps (id) on delete cascade,
  outcome       text not null check (outcome in ('inside', 'outside', 'inaccurate')),
  distance_m    integer check (distance_m between 0 and 1000000 and distance_m % 10 = 0),
  attempted_at  timestamptz not null default now(),
  check ((outcome = 'inaccurate') = (distance_m is null))
);

create index geofence_checkins_user_step_idx on missions.geofence_checkins (user_id, step_id, attempted_at desc);

alter table missions.geofence_checkins enable row level security;
-- Sem UPDATE/DELETE; o horário é sempre o do banco (attempted_at fora do grant de INSERT).
grant select on missions.geofence_checkins to authenticated;
grant insert (user_id, step_id, outcome, distance_m) on missions.geofence_checkins to authenticated;

create policy "dono lê" on missions.geofence_checkins for select to authenticated
  using (user_id = (select auth.uid()));

-- Só em nome próprio e só em etapas com GPS. A tentativa é registrada antes das regras da missão
-- (aceite, ordem): assim toda tentativa conta no limite, e uma tentativa nunca conclui nada sozinha
-- (a conclusão continua passando pela RLS de step_completions).
create policy "dono registra check-in em etapa com gps" on missions.geofence_checkins for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from missions.mission_steps s where s.id = step_id and s.validation in ('gps', 'qr_gps'))
  );
