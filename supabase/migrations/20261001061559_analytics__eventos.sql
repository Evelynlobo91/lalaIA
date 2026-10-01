-- analytics: registro uniforme de interações (RF25). Append-only, sem dados pessoais (LGPD):
-- guarda o QUE aconteceu com QUAL entidade e QUANDO, nunca QUEM. As métricas do parceiro (#77/#78)
-- são agregações por entidade e período.
create schema if not exists analytics;
comment on schema analytics is 'Módulo Analytics: interações (view, favorite, quero_ir, live_view, checkin) e agregações.';
-- Só o backend acessa (nem anon nem authenticated): o schema fica fora da API REST.
revoke all on schema analytics from public, anon, authenticated;

create table analytics.events (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('view', 'favorite', 'quero_ir', 'live_view', 'checkin')),
  entity_type  text not null check (entity_type in ('place', 'event', 'mission', 'live')),
  -- Entidade de outro módulo: só o id, sem FK entre schemas.
  entity_id    uuid not null,
  -- 'ui' = enviado pela tela (endpoint); 'domain' = assinatura de evento de domínio.
  source       text not null check (source in ('ui', 'domain')),
  -- Id do evento de domínio de origem: o mesmo evento nunca é contado duas vezes.
  event_id     uuid unique,
  occurred_at  timestamptz not null default now(),
  check ((source = 'domain') = (event_id is not null))
);

comment on table analytics.events is 'Interações append-only. Sem user_id, IP ou user agent (LGPD).';

-- Consultas do painel: por entidade, tipo e período.
create index events_entity_idx on analytics.events (entity_type, entity_id, kind, occurred_at desc);

-- Append-only: o histórico não é alterado. DELETE continua possível para o dono do banco
-- (política de retenção futura), mas nunca UPDATE.
create or replace function analytics.forbid_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'analytics.events é append-only: % não é permitido', tg_op using errcode = 'restrict_violation';
end;
$$;

create trigger events_append_only
  before update on analytics.events
  for each row execute function analytics.forbid_update();

-- Defesa em profundidade: RLS ligada e sem políticas (nenhum papel da API lê ou grava).
alter table analytics.events enable row level security;
