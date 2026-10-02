-- billing: eventos de pagamento recebidos do provedor por webhook (#154). Log append-only e idempotente.
create table billing.payment_events (
  id                  bigint generated always as identity primary key,
  gateway             text not null check (length(gateway) between 2 and 30),
  -- Id único do evento no provedor: o mesmo webhook (reenvio) nunca é aplicado duas vezes.
  gateway_event_id    text not null check (length(gateway_event_id) between 1 and 200),
  kind                text not null check (kind in ('paid', 'overdue', 'refunded')),
  gateway_invoice_id  text not null check (length(gateway_invoice_id) between 1 and 200),
  -- Fatura encontrada (null quando a cobrança não é nossa). Sem FK: o log é append-only e sobrevive à exclusão
  -- da conta (a cascata apaga a fatura; aqui fica só o id).
  invoice_id          uuid,
  -- O que aconteceu ao aplicar: applied, ignored (não mudava nada) ou unknown_invoice.
  outcome             text not null check (outcome in ('applied', 'ignored', 'unknown_invoice')),
  occurred_at         timestamptz not null,
  received_at         timestamptz not null default now(),
  unique (gateway, gateway_event_id)
);

comment on table billing.payment_events is 'Webhooks de pagamento (append-only). Só ids e o tipo do evento: nenhum dado de cartão ou do pagador.';
create index payment_events_invoice_idx on billing.payment_events (invoice_id, received_at desc);

create function billing.forbid_payment_event_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'billing.payment_events é append-only: % não é permitido', tg_op using errcode = 'restrict_violation';
end;
$$;

create trigger payment_events_append_only
  before update or delete on billing.payment_events
  for each row execute function billing.forbid_payment_event_change();

alter table billing.payment_events enable row level security;
grant select on billing.payment_events to authenticated;
create policy "financeiro lê os eventos de pagamento" on billing.payment_events for select to authenticated
  using ((select authz.has_capability('billing:read')));
