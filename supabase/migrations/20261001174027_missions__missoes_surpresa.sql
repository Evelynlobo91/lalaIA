-- missions: missões surpresa (#63, RF35). Não aparecem na lista pública: são oferecidas a quem está perto,
-- com validade curta, e a pessoa aceita ou ignora. As etapas só se revelam depois do aceite, uma por vez.
alter table missions.missions add column surprise boolean not null default false;
grant update (surprise) on missions.missions to authenticated;

create index missions_surprise_available_idx on missions.missions (ends_at, starts_at) where status = 'active' and surprise;

-- Oferta: uma por pessoa e missão (ignorada ou expirada, não volta).
create table missions.surprise_offers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  mission_id    uuid not null references missions.missions (id) on delete cascade,
  offered_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  status        text not null default 'offered' check (status in ('offered', 'accepted', 'dismissed')),
  responded_at  timestamptz,
  unique (user_id, mission_id),
  -- Validade curta: no máximo 2 horas.
  check (expires_at > offered_at and expires_at <= offered_at + interval '2 hours'),
  check ((status = 'offered') = (responded_at is null))
);

create index surprise_offers_user_idx on missions.surprise_offers (user_id, status, expires_at desc);

alter table missions.surprise_offers enable row level security;
grant select on missions.surprise_offers to authenticated;
-- offered_at e status ficam fora do grant de INSERT: sempre o horário do banco e sempre 'offered'.
grant insert (user_id, mission_id, expires_at) on missions.surprise_offers to authenticated;
grant update (status, responded_at) on missions.surprise_offers to authenticated;

create policy "dono lê" on missions.surprise_offers for select to authenticated
  using (user_id = (select auth.uid()));

-- Só para si, só missão surpresa ativa e no prazo, nunca a própria, e com validade de até 2 h a partir de agora.
create policy "dono recebe oferta de missão surpresa" on missions.surprise_offers for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and expires_at <= now() + interval '2 hours'
    and exists (
      select 1 from missions.missions m
      where m.id = mission_id and m.surprise and m.status = 'active' and now() between m.starts_at and m.ends_at
        and m.owner_id <> (select auth.uid())
    )
  );

-- Responder: só a própria oferta em aberto; aceitar só antes de expirar.
create policy "dono responde a oferta" on missions.surprise_offers for update to authenticated
  using (user_id = (select auth.uid()) and status = 'offered')
  with check (
    user_id = (select auth.uid())
    and responded_at is not null
    and (status = 'dismissed' or (status = 'accepted' and expires_at > now()))
  );

-- Aceite de missão: missão surpresa só com uma oferta em aberto para a pessoa.
drop policy "dono aceita missão ativa" on missions.user_missions;
create policy "dono aceita missão ativa" on missions.user_missions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'active'
    and completed_at is null
    and exists (
      select 1 from missions.missions m
      where m.id = mission_id and m.status = 'active' and now() between m.starts_at and m.ends_at
        and (
          not m.surprise
          or exists (
            select 1 from missions.surprise_offers o
            where o.mission_id = m.id and o.user_id = (select auth.uid()) and o.status = 'offered' and o.expires_at > now()
          )
        )
    )
  );
