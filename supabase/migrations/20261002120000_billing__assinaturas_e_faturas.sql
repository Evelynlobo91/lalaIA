-- billing: assinatura do parceiro e faturas do ciclo mensal (#153).
create table billing.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  -- Conta do parceiro (a mesma usada como dono de eventos, missões e lives). Uma assinatura por conta.
  owner_id              uuid not null unique references auth.users (id) on delete cascade,
  -- Plano que vale agora.
  plan_id               uuid not null references billing.plans (id),
  -- Troca de plano aguardando pagamento: passa a valer (vira plan_id) quando a fatura dele for paga.
  pending_plan_id       uuid references billing.plans (id),
  -- pending: aguardando o primeiro pagamento · active: em dia · past_due: fatura vencida, dentro da carência
  -- suspended: inadimplente (recursos pagos desligados) · cancelled: encerrada.
  status                text not null check (status in ('pending', 'active', 'past_due', 'suspended', 'cancelled')),
  -- Ciclo vigente (o fim é exclusivo). Vazio enquanto o primeiro pagamento não chega.
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  cancelled_at          timestamptz,
  check (current_period_start is null or current_period_end > current_period_start),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create index subscriptions_status_idx on billing.subscriptions (status, current_period_end);

create trigger subscriptions_updated_at
  before update on billing.subscriptions
  for each row execute function platform.set_updated_at();

create table billing.invoices (
  id                  uuid primary key default gen_random_uuid(),
  subscription_id     uuid not null references billing.subscriptions (id) on delete cascade,
  -- Guardados na fatura: o plano e o valor do momento da cobrança não mudam se o plano for editado depois.
  plan_id             uuid not null references billing.plans (id),
  amount_cents        integer not null check (amount_cents > 0),
  -- Ciclo que a fatura paga (o fim é exclusivo).
  period_start        timestamptz not null,
  period_end          timestamptz not null,
  -- Vencimento: dia de calendário de Joinville.
  due_on              date not null,
  status              text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'refunded', 'cancelled')),
  -- Provedor de pagamento e o identificador da cobrança nele (nunca dados de cartão).
  gateway             text not null check (length(gateway) between 2 and 30),
  gateway_invoice_id  text not null check (length(gateway_invoice_id) between 1 and 200),
  payment_url         text not null check (payment_url ~ '^(https://|/)' and length(payment_url) <= 500),
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (period_end > period_start),
  check ((status in ('paid', 'refunded')) = (paid_at is not null)),
  unique (gateway, gateway_invoice_id),
  -- Uma fatura por ciclo: gerar de novo o mesmo ciclo não duplica.
  unique (subscription_id, period_start)
);

create index invoices_status_idx on billing.invoices (status, due_on);

create trigger invoices_updated_at
  before update on billing.invoices
  for each row execute function platform.set_updated_at();

alter table billing.subscriptions enable row level security;
alter table billing.invoices enable row level security;
-- Só leitura para o backend "como o usuário": quem grava é o sistema (assinar, ciclo, webhooks).
grant select on billing.subscriptions, billing.invoices to authenticated;

create policy "dono ou financeiro lê a assinatura" on billing.subscriptions for select to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_capability('billing:read')));

create policy "dono ou financeiro lê as faturas" on billing.invoices for select to authenticated
  using (
    (select authz.has_capability('billing:read'))
    or exists (select 1 from billing.subscriptions s where s.id = subscription_id and s.owner_id = (select auth.uid()))
  );

-- O catálogo de planos ativos é público para quem está logado (o parceiro escolhe um plano).
create policy "parceiro lê planos ativos" on billing.plans for select to authenticated
  using (active);
