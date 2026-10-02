-- partners: descontos e promoções do parceiro (#30). Ofertas num lugar que ele gerencia ou num evento que
-- criou; o explorador resgata um código curto e o parceiro valida no balcão.
-- target_id referencia places.places ou events.events só pelo id (sem FK entre schemas de módulos: ADR 0001).
-- Quem é dono do lugar/evento é conferido pelo caso de uso, pelas APIs públicas de places e events.

create table partners.offers (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid not null references partners.partners (id) on delete cascade,
  target_type      text not null check (target_type in ('place', 'event')),
  target_id        uuid not null,
  title            text not null check (length(trim(title)) between 3 and 80),
  description      text not null check (length(trim(description)) between 10 and 500),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  -- Limite total de resgates (null = sem limite). Cada pessoa resgata uma vez só (unique em offer_redemptions).
  max_redemptions  integer check (max_redemptions is null or max_redemptions between 1 and 100000),
  -- Contador mantido só pelo trigger de resgate (fora dos grants): é ele que garante o limite sob concorrência.
  redeemed_count   integer not null default 0 check (redeemed_count >= 0),
  status           text not null default 'active' check (status in ('active', 'ended')),
  ended_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '366 days'),
  check (max_redemptions is null or redeemed_count <= max_redemptions),
  check ((status = 'ended') = (ended_at is not null))
);

create index offers_target_idx on partners.offers (target_type, target_id, ends_at) where status = 'active';
create index offers_partner_idx on partners.offers (partner_id, created_at desc);

create trigger offers_updated_at
  before update on partners.offers
  for each row execute function platform.set_updated_at();

create table partners.offer_redemptions (
  id            uuid primary key default gen_random_uuid(),
  offer_id      uuid not null references partners.offers (id) on delete cascade,
  -- LGPD: excluir a conta apaga os resgates da pessoa.
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- Código curto sem caracteres ambíguos (domain/offer-code.ts), único no app inteiro.
  code          text not null unique check (code ~ '^[2-9A-HJKMNP-Z]{8}$'),
  redeemed_at   timestamptz not null default now(),
  validated_at  timestamptz,
  validated_by  uuid references auth.users (id) on delete set null,
  -- Um resgate por pessoa e oferta.
  unique (offer_id, user_id),
  check (validated_by is null or validated_at is not null)
);

create index offer_redemptions_user_idx on partners.offer_redemptions (user_id, redeemed_at desc);

revoke all on partners.offers, partners.offer_redemptions from anon;

-- Dono da oferta = dono do cadastro de parceiro aprovado. Security definer: o explorador não lê
-- partners.partners (RLS), mas a política de resgate precisa saber se a oferta é dele.
create or replace function partners.owns_offer(p_offer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from partners.offers o
    join partners.partners p on p.id = o.partner_id
    where o.id = p_offer_id and p.owner_id = (select auth.uid()) and p.status = 'approved'
  );
$$;
revoke all on function partners.owns_offer(uuid) from public, anon;
grant execute on function partners.owns_offer(uuid) to authenticated;

-- Ofertas: informação pública (aparece na página do lugar/evento). O parceiro cria e altera só as próprias,
-- sem trocar de dono nem mexer no contador (column grants).
alter table partners.offers enable row level security;
grant select on partners.offers to authenticated;
grant insert (partner_id, target_type, target_id, title, description, starts_at, ends_at, max_redemptions) on partners.offers to authenticated;
grant update (target_type, target_id, title, description, starts_at, ends_at, max_redemptions, status, ended_at) on partners.offers to authenticated;

create policy "todos leem" on partners.offers for select to authenticated using (true);

create policy "parceiro aprovado cria a própria" on partners.offers for insert to authenticated
  with check ((select partners.is_partner_owner(partner_id)) and status = 'active');

create policy "parceiro altera a própria" on partners.offers for update to authenticated
  using ((select partners.is_partner_owner(partner_id)))
  with check ((select partners.is_partner_owner(partner_id)));

-- Depois do primeiro resgate a oferta não muda (quem resgatou fica com a oferta que viu); só pode ser
-- encerrada. Encerrar é definitivo. Vale para qualquer papel.
create or replace function partners.lock_offer_after_redemption()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'ended' and new.status <> 'ended' then
    raise exception 'oferta encerrada não volta a valer' using errcode = 'check_violation';
  end if;
  if old.redeemed_count > 0 and (
    new.target_type is distinct from old.target_type or new.target_id is distinct from old.target_id
    or new.title is distinct from old.title or new.description is distinct from old.description
    or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    or new.max_redemptions is distinct from old.max_redemptions
  ) then
    raise exception 'oferta já resgatada: só pode ser encerrada' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger offers_lock_after_redemption
  before update on partners.offers
  for each row execute function partners.lock_offer_after_redemption();

-- Resgates: a pessoa lê os próprios; o parceiro lê os das próprias ofertas (para validar no balcão).
alter table partners.offer_redemptions enable row level security;
grant select on partners.offer_redemptions to authenticated;
grant insert (offer_id, user_id, code) on partners.offer_redemptions to authenticated;
-- Validar é a única alteração possível, e só nestas duas colunas.
grant update (validated_at, validated_by) on partners.offer_redemptions to authenticated;

create policy "dono do resgate ou da oferta lê" on partners.offer_redemptions for select to authenticated
  using (user_id = (select auth.uid()) or partners.owns_offer(offer_id));

-- Resgatar: em nome próprio, oferta ativa e dentro da validade, e nunca a própria oferta.
create policy "explorador resgata oferta vigente" on partners.offer_redemptions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and validated_at is null
    and validated_by is null
    and not partners.owns_offer(offer_id)
    and exists (select 1 from partners.offers o where o.id = offer_id and o.status = 'active' and now() >= o.starts_at and now() < o.ends_at)
  );

-- Validar: só o dono da oferta, uma vez só (o using exige que ainda não tenha sido validado), em nome próprio.
create policy "parceiro valida resgate da própria oferta" on partners.offer_redemptions for update to authenticated
  using (partners.owns_offer(offer_id) and validated_at is null)
  with check (partners.owns_offer(offer_id) and validated_by = (select auth.uid()) and validated_at is not null);

-- Limite total sob concorrência: o UPDATE trava a linha da oferta, então resgates simultâneos passam um de
-- cada vez e cada um vê o contador já atualizado. AFTER INSERT: só conta o que foi inserido de fato
-- (o "on conflict do nothing" do resgate repetido não passa por aqui). Esgotou → desfaz o resgate.
create or replace function partners.count_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update partners.offers
     set redeemed_count = redeemed_count + 1
   where id = new.offer_id
     and (max_redemptions is null or redeemed_count < max_redemptions);
  if not found then
    raise exception 'oferta esgotada' using errcode = 'LAESG';
  end if;
  return null;
end;
$$;
revoke all on function partners.count_redemption() from public, anon, authenticated;

create trigger offer_redemptions_count
  after insert on partners.offer_redemptions
  for each row execute function partners.count_redemption();
