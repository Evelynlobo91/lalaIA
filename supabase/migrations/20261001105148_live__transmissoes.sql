-- live: transmissões ao vivo de lugares e eventos (RF18–RF25). A plataforma não faz streaming:
-- o parceiro transmite via OBS/Larix para o provedor (Mux) e aqui ficam só o vínculo, a chave e o status.
create schema if not exists live;
comment on schema live is 'Módulo Live: transmissões (stream key por parceiro), status e ciclo de vida.';
revoke all on schema live from public, anon;
-- `authenticated` só para o backend agir "como o usuário" (asUser) sob RLS; o schema segue fora da API REST.
grant usage on schema live to authenticated;

create table live.streams (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users (id) on delete cascade,
  -- Lugar ou evento transmitido (outros módulos): só o id, sem FK entre schemas.
  entity_type         text not null check (entity_type in ('place', 'event')),
  entity_id           uuid not null,
  provider            text not null check (provider in ('mux', 'fake')),
  provider_stream_id  text not null unique check (length(provider_stream_id) between 1 and 200),
  playback_id         text not null check (length(playback_id) between 1 and 200),
  -- Controle do parceiro: 'on' (no ar quando houver sinal), 'paused' (player oculto, ingestão continua)
  -- e 'ended' (chave desativada no provedor).
  control             text not null default 'on' check (control in ('on', 'paused', 'ended')),
  -- Sinal informado pelo provedor (webhooks).
  signal              text not null default 'offline' check (signal in ('offline', 'live')),
  signal_changed_at   timestamptz not null default now(),
  -- Status exibido: derivado, nunca gravado à mão.
  status              text generated always as (
                        case
                          when control = 'ended' then 'ended'
                          when control = 'paused' then 'paused'
                          when signal = 'live' then 'live'
                          else 'waiting'
                        end
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Uma transmissão por lugar/evento.
  unique (entity_type, entity_id)
);

create index streams_owner_idx on live.streams (owner_id, created_at desc);
create index streams_live_idx on live.streams (status) where status = 'live';

create trigger streams_updated_at
  before update on live.streams
  for each row execute function platform.set_updated_at();

alter table live.streams enable row level security;
grant select on live.streams to authenticated;
grant insert (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id) on live.streams to authenticated;
-- Como usuário, só o controle muda. Sinal, dono, vínculo e provedor nunca (o sinal vem do backend, pelos webhooks).
grant update (control) on live.streams to authenticated;

create policy "dono ou admin lê" on live.streams for select to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_role('admin')));

create policy "parceiro cria a própria" on live.streams for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select authz.has_role('partner')));

create policy "dono ou admin controla" on live.streams for update to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_role('admin')))
  with check (owner_id = (select auth.uid()) or (select authz.has_role('admin')));

-- Chave de transmissão (segredo): tabela separada, que SÓ o dono lê (nem admin, nem a leitura pública).
-- Quem tem a chave transmite em nome do parceiro.
create table live.stream_credentials (
  stream_id   uuid primary key references live.streams (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  stream_key  text not null check (length(stream_key) between 16 and 200),
  rotated_at  timestamptz not null default now()
);

alter table live.stream_credentials enable row level security;
grant select, insert on live.stream_credentials to authenticated;
grant update (stream_key, rotated_at) on live.stream_credentials to authenticated;

create policy "só o dono lê a chave" on live.stream_credentials for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "dono grava a chave da própria transmissão" on live.stream_credentials for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from live.streams s where s.id = stream_id and s.owner_id = (select auth.uid()))
  );

create policy "só o dono rotaciona" on live.stream_credentials for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
