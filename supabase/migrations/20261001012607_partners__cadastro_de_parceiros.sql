-- partners: cadastro de estabelecimentos e promotores, com aprovação por admin (RNF05, RNF14).
create schema if not exists partners;
comment on schema partners is 'Módulo Parceiros: estabelecimentos e promotores.';
revoke all on schema partners from anon;
-- `authenticated` só para o backend agir "como o usuário" (asUser) sob RLS; o schema segue fora da API REST.
grant usage on schema partners to authenticated;

create table partners.partners (
  id               uuid primary key default gen_random_uuid(),
  -- POC: uma conta = um parceiro.
  owner_id         uuid not null unique references auth.users (id) on delete cascade,
  kind             text not null check (kind in ('estabelecimento', 'promotor')),
  business_name    text not null check (length(trim(business_name)) between 2 and 120),
  phone            text not null check (phone ~ '^\+?[0-9]{10,13}$'),
  instagram        text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  cnpj             text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  description      text not null check (length(trim(description)) between 20 and 600),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text check (rejection_reason is null or length(rejection_reason) between 5 and 500),
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Recusa sempre tem motivo (a pessoa precisa saber o que corrigir).
  check (status <> 'rejected' or rejection_reason is not null)
);

create index partners_status_idx on partners.partners (status, created_at);

create trigger partners_updated_at
  before update on partners.partners
  for each row execute function platform.set_updated_at();

alter table partners.partners enable row level security;
grant select, insert, update on partners.partners to authenticated;

-- Dono vê o próprio cadastro; admin vê todos.
create policy "dono ou admin lê" on partners.partners for select to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_role('admin')));

-- Cada um só cria o próprio cadastro, sempre como pendente.
create policy "dono cria o próprio, pendente" on partners.partners for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending' and reviewed_by is null);

-- Dono edita enquanto não aprovado e volta para a fila (reenviar após recusa);
-- não pode se aprovar nem mexer nos campos de revisão.
create policy "dono reenvia" on partners.partners for update to authenticated
  using (owner_id = (select auth.uid()) and status in ('pending', 'rejected'))
  with check (owner_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and rejection_reason is null);

-- Admin aprova ou recusa.
create policy "admin revisa" on partners.partners for update to authenticated
  using ((select authz.has_role('admin')))
  with check ((select authz.has_role('admin')));
