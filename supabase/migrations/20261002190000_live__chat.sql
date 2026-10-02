-- live: chat da transmissão (#95, slices #187 e #188). Mensagens curtas ao lado do player, gravadas sempre pelo
-- servidor (que valida, filtra e aplica o rate limit). O público lê pelo backend; a tabela não é exposta.

-- O parceiro pode desligar o chat de uma transmissão (o controle vem no slice de moderação, #192).
alter table live.streams add column chat_enabled boolean not null default true;

create table live.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  -- Ordem estável das mensagens (cursor do histórico e da atualização).
  seq         bigint generated always as identity unique,
  stream_id   uuid not null references live.streams (id) on delete cascade,
  -- Conta excluída (LGPD): a mensagem fica, sem autor ("Usuário removido").
  user_id     uuid references auth.users (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 200),
  -- Mensagem do responsável pela transmissão (selo "Anfitrião").
  is_host     boolean not null default false,
  reply_to    uuid references live.chat_messages (id) on delete set null,
  -- Apagada pela moderação ou pelo próprio autor: some do chat, fica para auditoria até a retenção.
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((deleted_at is null) or (deleted_at >= created_at))
);

create index chat_messages_stream_idx on live.chat_messages (stream_id, seq desc);
-- Rate limit: última mensagem da pessoa na transmissão.
create index chat_messages_author_idx on live.chat_messages (stream_id, user_id, created_at desc);

alter table live.chat_messages enable row level security;
revoke all on live.chat_messages from anon;
grant select on live.chat_messages to authenticated;
grant insert (stream_id, user_id, body, is_host, reply_to) on live.chat_messages to authenticated;

-- Quem envia não lê live.streams (RLS: só dono e admin). Estas funções respondem só sim/não.
create or replace function live.chat_is_open(p_stream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from live.streams s
    where s.id = p_stream_id and s.status = 'live' and s.chat_enabled and not platform.owner_suspended(s.owner_id)
  );
$$;

create or replace function live.is_stream_host(p_stream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from live.streams s where s.id = p_stream_id and s.owner_id = (select auth.uid()));
$$;

create or replace function live.chat_message_in_stream(p_message_id uuid, p_stream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from live.chat_messages m where m.id = p_message_id and m.stream_id = p_stream_id and m.deleted_at is null);
$$;

revoke all on function live.chat_is_open(uuid), live.is_stream_host(uuid), live.chat_message_in_stream(uuid, uuid) from public, anon;
grant execute on function live.chat_is_open(uuid), live.is_stream_host(uuid), live.chat_message_in_stream(uuid, uuid) to authenticated;

-- Cada pessoa lê as próprias mensagens (o INSERT ... RETURNING precisa); o histórico público sai pelo backend.
create policy "autor lê as próprias" on live.chat_messages for select to authenticated
  using (user_id = (select auth.uid()));

-- Enviar: em nome próprio, só com o chat aberto (live no ar e chat ligado), o selo de anfitrião só para o dono
-- e a resposta só a uma mensagem da mesma transmissão.
create policy "logado envia com o chat aberto" on live.chat_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and live.chat_is_open(stream_id)
    and is_host = live.is_stream_host(stream_id)
    and (reply_to is null or live.chat_message_in_stream(reply_to, stream_id))
  );
