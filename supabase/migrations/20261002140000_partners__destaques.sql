-- partners: destaque patrocinado de um lugar ou evento do parceiro, por um período (#29).
-- O direito ao destaque vem do plano (recurso `destaque`, módulo billing); aqui fica só o que foi destacado e quando.
create table partners.sponsorships (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references partners.partners (id) on delete cascade,
  -- Alvo de outro módulo (places ou events): só o id, sem FK entre schemas.
  target_type  text not null check (target_type in ('place', 'event')),
  target_id    uuid not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'active' check (status in ('active', 'ended')),
  ended_at     timestamptz,
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '31 days'),
  check ((status = 'ended') = (ended_at is not null))
);

-- Um destaque ativo por alvo.
create unique index sponsorships_one_active_idx on partners.sponsorships (target_type, target_id) where status = 'active';
create index sponsorships_partner_idx on partners.sponsorships (partner_id, created_at desc);
create index sponsorships_window_idx on partners.sponsorships (ends_at) where status = 'active';

alter table partners.sponsorships enable row level security;
grant select, insert, update on partners.sponsorships to authenticated;

create policy "parceiro lê os próprios, moderação lê todos" on partners.sponsorships for select to authenticated
  using ((select partners.is_partner_owner(partner_id)) or (select authz.has_capability('partners:review')));
create policy "parceiro aprovado destaca" on partners.sponsorships for insert to authenticated
  with check ((select partners.is_partner_owner(partner_id)) and status = 'active');
create policy "parceiro encerra o próprio" on partners.sponsorships for update to authenticated
  using ((select partners.is_partner_owner(partner_id)))
  with check ((select partners.is_partner_owner(partner_id)));
