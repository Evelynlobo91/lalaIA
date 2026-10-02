-- partners: suspender e reativar parceiro (#144).
-- Enquanto o parceiro está suspenso, o que ele publicou (eventos, missões, ofertas, lives) some das
-- telas públicas. Os módulos donos filtram com platform.owner_suspended(owner_id), sem join entre schemas.

alter table partners.partners drop constraint partners_status_check;
alter table partners.partners add constraint partners_status_check check (status in ('pending', 'approved', 'rejected', 'suspended'));

alter table partners.partners
  add column suspension_reason text check (suspension_reason is null or length(suspension_reason) between 5 and 500),
  add column suspended_by uuid references auth.users (id) on delete set null,
  add column suspended_at timestamptz,
  -- Suspensão sempre tem motivo (o parceiro vê no portal).
  add constraint partners_suspended_has_reason check (status <> 'suspended' or suspension_reason is not null);

-- Kernel: donos suspensos. Só a trigger abaixo escreve; os módulos só perguntam pela função.
create table platform.suspended_owners (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  since    timestamptz not null default now()
);
comment on table platform.suspended_owners is 'Donos de conteúdo suspensos (espelho de partners.partners.status = suspended).';
alter table platform.suspended_owners enable row level security;
revoke all on platform.suspended_owners from anon, authenticated;

create function platform.owner_suspended(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from platform.suspended_owners s where s.owner_id = owner);
$$;
comment on function platform.owner_suspended(uuid) is 'O dono está suspenso? Use nas consultas públicas: and not platform.owner_suspended(owner_id).';
-- Só o backend (consultas públicas, sem asUser) usa a função; o schema platform segue fechado para a API.
revoke all on function platform.owner_suspended(uuid) from public, anon, authenticated;

-- Mantém o espelho na mesma transação da mudança de status (nada de evento que possa se perder).
create function partners.sync_suspended_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'suspended' then
    insert into platform.suspended_owners (owner_id) values (new.owner_id) on conflict (owner_id) do nothing;
  else
    delete from platform.suspended_owners where owner_id = new.owner_id;
  end if;
  return new;
end;
$$;

create trigger partners_sync_suspended_owner
  after insert or update of status on partners.partners
  for each row execute function partners.sync_suspended_owner();

create index partners_owner_status_idx on partners.partners (status, business_name);
