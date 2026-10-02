-- backoffice: trilha de auditoria das ações administrativas (#146). Append-only: quem, o quê, quando.
create schema if not exists backoffice;
comment on schema backoffice is 'Módulo Backoffice: operação interna da plataforma.';
-- Só o backend acessa: o schema fica fora da API REST.
revoke all on schema backoffice from public, anon, authenticated;

create table backoffice.audit_log (
  id           bigint generated always as identity primary key,
  -- Id do evento de domínio de origem: o mesmo evento nunca gera dois registros.
  event_id     uuid not null unique,
  -- Quem agiu. Sem FK: o registro sobrevive à exclusão da conta (fica só o id).
  actor_id     uuid not null,
  action       text not null check (action ~ '^[a-z]+(\.[a-z_]+)+$' and length(action) <= 60),
  target_type  text not null check (target_type in ('partner', 'place_claim', 'place', 'event', 'mission')),
  -- Entidade de outro módulo: só o id, sem FK entre schemas.
  target_id    uuid not null,
  occurred_at  timestamptz not null
);

comment on table backoffice.audit_log is 'Ações administrativas (append-only). Só ids: nenhum dado pessoal nem conteúdo.';

create index audit_log_occurred_idx on backoffice.audit_log (occurred_at desc, id desc);
create index audit_log_actor_idx on backoffice.audit_log (actor_id, occurred_at desc);
create index audit_log_action_idx on backoffice.audit_log (action, occurred_at desc);

-- Append-only de verdade: nem UPDATE nem DELETE.
create function backoffice.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'backoffice.audit_log é append-only: % não é permitido', tg_op using errcode = 'restrict_violation';
end;
$$;

create trigger audit_log_append_only
  before update or delete on backoffice.audit_log
  for each row execute function backoffice.forbid_change();

-- Defesa em profundidade: RLS ligada e sem políticas (nenhum papel da API lê ou grava).
alter table backoffice.audit_log enable row level security;
