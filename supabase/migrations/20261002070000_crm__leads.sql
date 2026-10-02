-- crm: captação de estabelecimentos (#147). Funil: lead → contato → proposta → parceiro ativo (ou perdido).
create schema if not exists crm;
comment on schema crm is 'Módulo CRM: leads de estabelecimentos e promotores em prospecção.';
revoke all on schema crm from public, anon;
-- `authenticated` só para o backend agir "como o usuário" (asUser) sob RLS; o schema segue fora da API REST.
grant usage on schema crm to authenticated;

create table crm.leads (
  id             uuid primary key default gen_random_uuid(),
  business_name  text not null check (length(trim(business_name)) between 2 and 120),
  contact_name   text not null check (length(trim(contact_name)) between 2 and 120),
  -- Só dígitos, com DDD (e +55 opcional).
  contact_phone  text check (contact_phone is null or contact_phone ~ '^\+?[0-9]{10,13}$'),
  contact_email  text check (contact_email is null or (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(contact_email) <= 254)),
  source         text not null check (source in ('instagram', 'indicacao', 'visita', 'outro')),
  -- Responsável pelo lead (alguém do time). Se a conta for excluída (LGPD), o lead fica sem responsável.
  owner_id       uuid references auth.users (id) on delete set null,
  stage          text not null default 'lead' check (stage in ('lead', 'contato', 'proposta', 'ativo', 'perdido')),
  lost_reason    text check (lost_reason is null or length(lost_reason) between 5 and 500),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Pelo menos um jeito de falar com a pessoa.
  check (contact_phone is not null or contact_email is not null),
  -- Lead perdido sempre tem motivo.
  check ((stage = 'perdido') = (lost_reason is not null))
);

create index leads_stage_idx on crm.leads (stage, updated_at desc);
create index leads_owner_idx on crm.leads (owner_id, stage);

create trigger leads_updated_at
  before update on crm.leads
  for each row execute function platform.set_updated_at();

alter table crm.leads enable row level security;
grant select, insert, update on crm.leads to authenticated;

-- RLS por capacidade (#157): quem tem leads:read vê; quem tem leads:write cria e altera.
create policy "time lê leads" on crm.leads for select to authenticated
  using ((select authz.has_capability('leads:read')));
create policy "time cria leads" on crm.leads for insert to authenticated
  with check ((select authz.has_capability('leads:write')) and created_by = (select auth.uid()));
create policy "time altera leads" on crm.leads for update to authenticated
  using ((select authz.has_capability('leads:write')))
  with check ((select authz.has_capability('leads:write')));
