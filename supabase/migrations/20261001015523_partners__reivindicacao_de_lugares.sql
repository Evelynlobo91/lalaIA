-- partners: pedido de vínculo parceiro ↔ lugar ("este estabelecimento é meu"), aprovado por admin.
-- place_id referencia places.places só pelo id (sem FK entre schemas de módulos: ADR 0001).
create table partners.place_claims (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid not null references partners.partners (id) on delete cascade,
  place_id         uuid not null,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text check (rejection_reason is null or length(rejection_reason) between 5 and 500),
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (status <> 'rejected' or rejection_reason is not null),
  unique (partner_id, place_id)
);

-- Um lugar tem no máximo um dono aprovado.
create unique index place_claims_one_owner_idx on partners.place_claims (place_id) where status = 'approved';
create index place_claims_status_idx on partners.place_claims (status, created_at);

create trigger place_claims_updated_at
  before update on partners.place_claims
  for each row execute function platform.set_updated_at();

alter table partners.place_claims enable row level security;
grant select, insert, update on partners.place_claims to authenticated;

-- Parceiro aprovado = dono do cadastro de parceiro com status aprovado.
create or replace function partners.is_partner_owner(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from partners.partners
    where id = p_partner_id and owner_id = (select auth.uid()) and status = 'approved'
  );
$$;
revoke all on function partners.is_partner_owner(uuid) from public, anon;
grant execute on function partners.is_partner_owner(uuid) to authenticated;

create policy "parceiro lê os próprios, admin lê todos" on partners.place_claims for select to authenticated
  using ((select partners.is_partner_owner(partner_id)) or (select authz.has_role('admin')));

create policy "parceiro aprovado pede vínculo" on partners.place_claims for insert to authenticated
  with check ((select partners.is_partner_owner(partner_id)) and status = 'pending' and reviewed_by is null);

-- Reenviar um pedido recusado volta para pendente; o parceiro não aprova o próprio pedido.
create policy "parceiro reenvia recusado" on partners.place_claims for update to authenticated
  using ((select partners.is_partner_owner(partner_id)) and status = 'rejected')
  with check ((select partners.is_partner_owner(partner_id)) and status = 'pending' and reviewed_by is null and rejection_reason is null);

create policy "admin revisa vínculo" on partners.place_claims for update to authenticated
  using ((select authz.has_role('admin')))
  with check ((select authz.has_role('admin')));
