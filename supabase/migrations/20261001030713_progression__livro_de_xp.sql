-- progression: livro-razão de XP (RF31). Append-only: o saldo é sempre a soma das transações.
create schema if not exists progression;
comment on schema progression is 'Módulo Progressão: XP (livro-razão), níveis e conquistas.';
revoke all on schema progression from anon;
-- `authenticated` só para o backend ler "como o usuário" (asUser) sob RLS; o schema segue fora da API REST.
grant usage on schema progression to authenticated;

create table progression.xp_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  amount       integer not null check (amount between 1 and 10000),
  reason       text not null check (reason in ('mission_step', 'mission_completed')),
  -- Origem do crédito (etapa ou missão, de outro módulo: só o id, sem FK entre schemas).
  source_id    uuid not null,
  -- Texto congelado no momento do crédito (o histórico não muda se a missão for renomeada).
  description  text not null check (length(trim(description)) between 1 and 200),
  -- Evento de domínio que gerou o crédito (auditoria).
  event_id     uuid not null unique,
  created_at   timestamptz not null default now(),
  -- Idempotência pela chave natural: a mesma etapa/missão nunca credita duas vezes para a mesma pessoa,
  -- mesmo que o evento seja publicado de novo (com outro id).
  unique (user_id, reason, source_id)
);

create index xp_transactions_user_idx on progression.xp_transactions (user_id, created_at desc);

-- Append-only, para qualquer papel (inclusive o backend). A única exceção é a exclusão em cascata da
-- conta (LGPD): ela chega por um trigger de FK, então pg_trigger_depth() > 1.
create or replace function progression.forbid_ledger_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and tg_level = 'ROW' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'progression.xp_transactions é append-only: % não é permitido', tg_op using errcode = 'restrict_violation';
end;
$$;

create trigger xp_transactions_append_only
  before update or delete on progression.xp_transactions
  for each row execute function progression.forbid_ledger_changes();

create trigger xp_transactions_no_truncate
  before truncate on progression.xp_transactions
  for each statement execute function progression.forbid_ledger_changes();

-- RLS: cada pessoa só lê as próprias transações. Ninguém grava como usuário: o crédito vem do backend,
-- pela assinatura dos eventos de missões.
alter table progression.xp_transactions enable row level security;
grant select on progression.xp_transactions to authenticated;

create policy "dono lê" on progression.xp_transactions for select to authenticated
  using (user_id = (select auth.uid()));

-- Saldo = soma do livro. security_invoker: a RLS da tabela vale também na view.
create view progression.xp_balances with (security_invoker = true) as
  select user_id, sum(amount)::integer as xp, count(*)::integer as transactions
  from progression.xp_transactions
  group by user_id;

grant select on progression.xp_balances to authenticated;
