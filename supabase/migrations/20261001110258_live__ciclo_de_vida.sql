-- live: log de ciclo de vida das transmissões (RNF18). Append-only: início, interrupção e encerramento
-- vindos do provedor (webhooks) e as ações do parceiro (pausar, encerrar, ativar, nova chave).
create table live.stream_lifecycle_events (
  id                 bigint generated always as identity primary key,
  stream_id          uuid not null references live.streams (id) on delete cascade,
  source             text not null check (source in ('provider', 'partner')),
  kind               text not null check (kind in (
                       'connected', 'active', 'disconnected', 'idle', 'enabled', 'disabled',
                       'paused', 'activated', 'ended', 'key_rotated'
                     )),
  -- Id único do evento no provedor: o mesmo webhook (reenvio) nunca é processado duas vezes.
  provider_event_id  text unique check (length(provider_event_id) between 1 and 200),
  -- Quem agiu (ações do parceiro/admin).
  actor_id           uuid references auth.users (id) on delete set null,
  -- Status exibido depois do evento.
  status_after       text not null check (status_after in ('waiting', 'live', 'paused', 'ended')),
  occurred_at        timestamptz not null,
  recorded_at        timestamptz not null default now(),
  -- actor_id é obrigatório para ações do parceiro na política de insert (RLS); aqui pode virar null
  -- quando a conta de quem agiu é excluída.
  check ((source = 'provider') = (provider_event_id is not null))
);

create index stream_lifecycle_stream_idx on live.stream_lifecycle_events (stream_id, occurred_at desc);

-- Append-only para qualquer papel (inclusive o backend). Exceções: a exclusão em cascata (conta apagada
-- → transmissão apagada → log), que chega por trigger de FK (pg_trigger_depth() > 1), e o `set null`
-- do actor_id quando a conta de quem agiu é excluída (LGPD).
create or replace function live.forbid_lifecycle_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 and tg_level = 'ROW' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if tg_op = 'UPDATE' and new.actor_id is null
       and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
      return new;
    end if;
  end if;
  raise exception 'live.stream_lifecycle_events é append-only: % não é permitido', tg_op using errcode = 'restrict_violation';
end;
$$;

create trigger stream_lifecycle_append_only
  before update or delete on live.stream_lifecycle_events
  for each row execute function live.forbid_lifecycle_changes();

create trigger stream_lifecycle_no_truncate
  before truncate on live.stream_lifecycle_events
  for each statement execute function live.forbid_lifecycle_changes();

-- RLS: o dono (ou admin) registra as próprias ações, em nome próprio, na transação do controle.
-- Eventos do provedor só o backend grava (webhook). Ninguém lê como usuário (por enquanto).
alter table live.stream_lifecycle_events enable row level security;
grant insert (stream_id, source, kind, actor_id, status_after, occurred_at) on live.stream_lifecycle_events to authenticated;

create policy "dono ou admin registra a própria ação" on live.stream_lifecycle_events for insert to authenticated
  with check (
    source = 'partner'
    and actor_id = (select auth.uid())
    and exists (
      select 1 from live.streams s
      where s.id = stream_id and (s.owner_id = (select auth.uid()) or (select authz.has_role('admin')))
    )
  );
