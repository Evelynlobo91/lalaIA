-- missions: recompensa do parceiro vinculada à missão (#62, RF36). Quem conclui a missão resgata um código
-- curto e o parceiro dono da missão valida no balcão. Tudo dentro do schema missions (sem FK para outros módulos).

-- Recompensa real só quando TODA etapa exige o QR do balcão (`qr` ou `qr_gps`): GPS é falsificável no celular.
-- Espelha `allowsRealReward` (domain/mission.ts). mission_steps é legível por todos, então não precisa de definer.
create or replace function missions.allows_real_reward(p_mission_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from missions.mission_steps where mission_id = p_mission_id)
     and not exists (select 1 from missions.mission_steps where mission_id = p_mission_id and validation not in ('qr', 'qr_gps'));
$$;
revoke all on function missions.allows_real_reward(uuid) from public, anon;
grant execute on function missions.allows_real_reward(uuid) to authenticated;

-- Uma recompensa por missão.
create table missions.mission_rewards (
  mission_id     uuid primary key references missions.missions (id) on delete cascade,
  description    text not null check (length(trim(description)) between 3 and 120),
  -- Estoque total (null = sem limite). Cada pessoa resgata uma vez só (unique em reward_claims).
  stock          integer check (stock is null or stock between 1 and 100000),
  -- Mantido só pelo trigger de resgate (fora dos grants): é ele que garante o estoque sob concorrência.
  claimed_count  integer not null default 0 check (claimed_count >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (stock is null or claimed_count <= stock)
);

create trigger mission_rewards_updated_at
  before update on missions.mission_rewards
  for each row execute function platform.set_updated_at();

create table missions.reward_claims (
  id            uuid primary key default gen_random_uuid(),
  mission_id    uuid not null references missions.mission_rewards (mission_id) on delete cascade,
  -- LGPD: excluir a conta apaga os resgates da pessoa.
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- Mesmo alfabeto dos códigos de oferta (shared/kernel/short-code.ts), único entre as recompensas.
  code          text not null unique check (code ~ '^[2-9A-HJKMNP-Z]{8}$'),
  claimed_at    timestamptz not null default now(),
  validated_at  timestamptz,
  validated_by  uuid references auth.users (id) on delete set null,
  -- Uma recompensa por pessoa e missão.
  unique (mission_id, user_id),
  check (validated_by is null or validated_at is not null)
);

create index reward_claims_user_idx on missions.reward_claims (user_id, claimed_at desc);

revoke all on missions.mission_rewards, missions.reward_claims from anon;

-- Dono da missão com papel de parceiro (revogar o papel vale na hora).
create or replace function missions.is_reward_owner(p_mission_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select authz.has_role('partner'))
     and exists (select 1 from missions.missions m where m.id = p_mission_id and m.owner_id = (select auth.uid()));
$$;
revoke all on function missions.is_reward_owner(uuid) from public, anon;
grant execute on function missions.is_reward_owner(uuid) to authenticated;

-- Recompensas: informação pública (aparece na página da missão). Só o parceiro dono vincula e edita,
-- só em missão com todas as etapas por QR, e sem mexer no contador (column grants).
alter table missions.mission_rewards enable row level security;
grant select on missions.mission_rewards to authenticated;
grant insert (mission_id, description, stock) on missions.mission_rewards to authenticated;
grant update (description, stock) on missions.mission_rewards to authenticated;

create policy "todos leem" on missions.mission_rewards for select to authenticated using (true);

create policy "parceiro dono vincula em missão só com QR" on missions.mission_rewards for insert to authenticated
  with check (missions.is_reward_owner(mission_id) and missions.allows_real_reward(mission_id));

create policy "parceiro dono edita" on missions.mission_rewards for update to authenticated
  using (missions.is_reward_owner(mission_id))
  with check (missions.is_reward_owner(mission_id) and missions.allows_real_reward(mission_id));

-- Depois do primeiro resgate a recompensa não muda (quem resgatou fica com o prêmio que viu). Vale para qualquer papel.
create or replace function missions.lock_reward_after_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.claimed_count > 0 and (new.description is distinct from old.description or new.stock is distinct from old.stock) then
    raise exception 'recompensa já resgatada: não pode mais mudar' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger mission_rewards_lock_after_claim
  before update on missions.mission_rewards
  for each row execute function missions.lock_reward_after_claim();

-- Resgates: a pessoa lê os próprios; o parceiro dono da missão lê os da missão (para validar no balcão).
alter table missions.reward_claims enable row level security;
grant select on missions.reward_claims to authenticated;
grant insert (mission_id, user_id, code) on missions.reward_claims to authenticated;
-- Validar é a única alteração possível, e só nestas duas colunas.
grant update (validated_at, validated_by) on missions.reward_claims to authenticated;

create policy "dono do resgate ou da missão lê" on missions.reward_claims for select to authenticated
  using (user_id = (select auth.uid()) or missions.is_reward_owner(mission_id));

-- Resgatar: em nome próprio, só quem CONCLUIU a missão, e só se ela ainda dá prêmio real (todas as etapas por QR).
create policy "quem concluiu a missão resgata" on missions.reward_claims for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and validated_at is null
    and validated_by is null
    and exists (
      select 1 from missions.user_missions um
      where um.user_id = (select auth.uid()) and um.mission_id = reward_claims.mission_id and um.status = 'completed'
    )
    and missions.allows_real_reward(mission_id)
  );

-- Validar: só o parceiro dono da missão, uma vez só (o using exige que ainda não tenha sido validado), em nome próprio.
create policy "parceiro dono valida" on missions.reward_claims for update to authenticated
  using (missions.is_reward_owner(mission_id) and validated_at is null)
  with check (missions.is_reward_owner(mission_id) and validated_by = (select auth.uid()) and validated_at is not null);

-- Estoque sob concorrência: o UPDATE trava a linha da recompensa, então resgates simultâneos passam um de cada
-- vez e cada um vê o contador já atualizado. AFTER INSERT: só conta o que foi inserido de fato (o "on conflict
-- do nothing" do resgate repetido não passa por aqui). Esgotou → desfaz o resgate.
create or replace function missions.count_reward_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update missions.mission_rewards
     set claimed_count = claimed_count + 1
   where mission_id = new.mission_id
     and (stock is null or claimed_count < stock);
  if not found then
    raise exception 'recompensa esgotada' using errcode = 'LARSG';
  end if;
  return null;
end;
$$;
revoke all on function missions.count_reward_claim() from public, anon, authenticated;

create trigger reward_claims_count
  after insert on missions.reward_claims
  for each row execute function missions.count_reward_claim();
