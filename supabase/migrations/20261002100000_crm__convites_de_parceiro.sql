-- crm: conversão de lead em parceiro por convite (#150). O comercial gera um link; a pessoa de contato entra
-- (ou se cadastra), aceita, e o parceiro nasce aprovado com os dados do lead, sem recadastro.
create table crm.partner_invites (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references crm.leads (id) on delete cascade,
  -- Só o hash (SHA-256) do token fica guardado: o link aparece uma vez, para quem gerou.
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Dados do parceiro que o lead não tem (tipo, telefone, descrição) e o lugar a vincular, se houver.
  kind          text not null check (kind in ('estabelecimento', 'promotor')),
  phone         text not null check (phone ~ '^\+?[0-9]{10,13}$'),
  description   text not null check (length(trim(description)) between 20 and 600),
  place_id      uuid,
  expires_at    timestamptz not null,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users (id) on delete set null,
  -- Parceiro criado na aceitação (id do módulo partners, sem FK entre schemas).
  partner_id    uuid,
  -- Quem aceitou e o parceiro criado só existem depois da aceitação.
  constraint partner_invites_acceptance_check check (accepted_at is not null or (accepted_by is null and partner_id is null))
);

-- Um convite em aberto por lead: gerar outro revoga o anterior.
create unique index partner_invites_one_open_idx on crm.partner_invites (lead_id) where accepted_at is null and revoked_at is null;

alter table crm.partner_invites enable row level security;
grant select, insert, update on crm.partner_invites to authenticated;

-- O time comercial gera, revoga e consulta. A aceitação é do sistema (token validado), fora da RLS.
create policy "time lê convites" on crm.partner_invites for select to authenticated
  using ((select authz.has_capability('leads:read')));
create policy "time gera convites em seu nome" on crm.partner_invites for insert to authenticated
  with check ((select authz.has_capability('leads:write')) and created_by = (select auth.uid()) and accepted_at is null);
create policy "time revoga convites" on crm.partner_invites for update to authenticated
  using ((select authz.has_capability('leads:write')) and accepted_at is null)
  with check ((select authz.has_capability('leads:write')) and accepted_at is null);
