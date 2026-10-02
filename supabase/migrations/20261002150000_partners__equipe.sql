-- partners: equipe do parceiro (#158). O dono convida funcionários pelo e-mail; o membro acessa só o balcão
-- (validar códigos de oferta), sem assinatura, dados nem edição do que o parceiro publica.
-- O vínculo é pelo e-mail confirmado da conta: vale assim que a pessoa entra com aquele e-mail e deixa de
-- valer no instante em que a linha é apagada (a checagem é feita a cada requisição, aqui no banco).
create table partners.team_members (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners.partners (id) on delete cascade,
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (partner_id, email)
);
create index team_members_email_idx on partners.team_members (email);

alter table partners.team_members enable row level security;
revoke all on partners.team_members from anon;
grant select, delete on partners.team_members to authenticated;
grant insert (partner_id, email, invited_by) on partners.team_members to authenticated;

-- Só o dono (parceiro aprovado) vê e mexe na própria equipe. O membro não lê esta tabela: o que ele pode
-- fazer passa pelas funções abaixo.
create policy "dono lê a própria equipe" on partners.team_members for select to authenticated
  using ((select partners.is_partner_owner(partner_id)));
create policy "dono convida" on partners.team_members for insert to authenticated
  with check ((select partners.is_partner_owner(partner_id)) and invited_by = (select auth.uid()));
create policy "dono remove" on partners.team_members for delete to authenticated
  using ((select partners.is_partner_owner(partner_id)));

-- Membro = conta com e-mail confirmado que consta na equipe de um parceiro aprovado.
create or replace function partners.is_team_member(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from partners.team_members m
    join partners.partners p on p.id = m.partner_id
    join auth.users u on lower(u.email) = m.email
    where m.partner_id = p_partner_id and p.status = 'approved'
      and u.id = (select auth.uid()) and u.email_confirmed_at is not null
  );
$$;
revoke all on function partners.is_team_member(uuid) from public, anon;
grant execute on function partners.is_team_member(uuid) to authenticated;

-- Quem atende no balcão da oferta: o dono ou um membro da equipe.
create or replace function partners.staffs_offer(p_offer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select partners.owns_offer(p_offer_id)
      or exists (select 1 from partners.offers o where o.id = p_offer_id and partners.is_team_member(o.partner_id));
$$;
revoke all on function partners.staffs_offer(uuid) from public, anon;
grant execute on function partners.staffs_offer(uuid) to authenticated;

-- Resgates: o membro lê e valida os das ofertas do parceiro (nada além disso). E, como o dono, não resgata
-- a oferta do lugar onde trabalha.
drop policy "dono do resgate ou da oferta lê" on partners.offer_redemptions;
create policy "dono do resgate ou quem atende a oferta lê" on partners.offer_redemptions for select to authenticated
  using (user_id = (select auth.uid()) or partners.staffs_offer(offer_id));

drop policy "parceiro valida resgate da própria oferta" on partners.offer_redemptions;
create policy "quem atende valida resgate da oferta" on partners.offer_redemptions for update to authenticated
  using (partners.staffs_offer(offer_id) and validated_at is null)
  with check (partners.staffs_offer(offer_id) and validated_by = (select auth.uid()) and validated_at is not null);

drop policy "explorador resgata oferta vigente" on partners.offer_redemptions;
create policy "explorador resgata oferta vigente" on partners.offer_redemptions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and validated_at is null
    and validated_by is null
    and not partners.staffs_offer(offer_id)
    and exists (select 1 from partners.offers o where o.id = offer_id and o.status = 'active' and now() >= o.starts_at and now() < o.ends_at)
  );
