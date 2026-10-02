-- live: moderação do chat pelo anfitrião (#95, slice #192): apagar e fixar mensagem, silenciar e banir,
-- modo lento e desligar o chat.

-- Modo lento: intervalo mínimo entre mensagens de cada pessoa (0 = desligado). O anfitrião não é afetado.
alter table live.streams add column chat_slow_seconds smallint not null default 0 check (chat_slow_seconds in (0, 10, 30));
-- Como usuário (RLS "dono ou admin controla"), além do controle e da situação, só as opções do chat mudam.
grant update (chat_enabled, chat_slow_seconds) on live.streams to authenticated;

-- Mensagem fixada no topo: uma por transmissão.
alter table live.chat_messages add column pinned_at timestamptz;
create unique index chat_messages_one_pinned_idx on live.chat_messages (stream_id) where pinned_at is not null and deleted_at is null;

-- Quem modera: o dono da transmissão ou a moderação da plataforma (content:edit).
create or replace function live.moderates_stream(p_stream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select live.is_stream_host(p_stream_id) or authz.has_capability('content:edit');
$$;
revoke all on function live.moderates_stream(uuid) from public, anon;
grant execute on function live.moderates_stream(uuid) to authenticated;

grant update (deleted_at, deleted_by, pinned_at) on live.chat_messages to authenticated;

create policy "quem modera lê as mensagens da transmissão" on live.chat_messages for select to authenticated
  using (live.moderates_stream(stream_id));

-- Apagar: o autor apaga a própria; quem modera apaga qualquer uma da transmissão. Fixar: só quem modera
-- (o gatilho abaixo separa as duas coisas, já que a política vale para a linha inteira).
create policy "autor apaga a própria, quem modera apaga e fixa" on live.chat_messages for update to authenticated
  using (user_id = (select auth.uid()) or live.moderates_stream(stream_id))
  with check (user_id = (select auth.uid()) or live.moderates_stream(stream_id));

create or replace function live.guard_chat_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new; -- backend sem usuário (retenção, manutenção)
  end if;
  if new.pinned_at is distinct from old.pinned_at and not live.moderates_stream(old.stream_id) then
    raise exception 'só quem modera fixa mensagem' using errcode = '42501';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'mensagem apagada não volta' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger chat_messages_guard_moderation
  before update on live.chat_messages
  for each row execute function live.guard_chat_moderation();

-- Silenciar e banir. `owner_id` é o parceiro dono do chat. Silêncio: vale numa transmissão, por um tempo ou até
-- o fim dela (`expires_at` nulo). Banimento: `stream_id` nulo, vale em todos os chats do parceiro até ser retirado.
create table live.chat_restrictions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('mute', 'ban')),
  stream_id   uuid references live.streams (id) on delete cascade,
  expires_at  timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((kind = 'ban') = (stream_id is null)),
  check (kind = 'mute' or expires_at is null),
  check (user_id <> owner_id)
);
-- Um banimento por pessoa e parceiro; um silêncio por pessoa e transmissão (silenciar de novo troca o prazo).
create unique index chat_restrictions_ban_idx on live.chat_restrictions (owner_id, user_id) where kind = 'ban';
create unique index chat_restrictions_mute_idx on live.chat_restrictions (stream_id, user_id) where kind = 'mute';
create index chat_restrictions_user_idx on live.chat_restrictions (user_id, owner_id);

alter table live.chat_restrictions enable row level security;
revoke all on live.chat_restrictions from anon;
grant select, insert, delete on live.chat_restrictions to authenticated;
grant update (expires_at, created_by) on live.chat_restrictions to authenticated;

-- A transmissão é mesmo do parceiro dono do chat? (quem modera pela plataforma não lê live.streams)
create or replace function live.stream_owned_by(p_stream_id uuid, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from live.streams s where s.id = p_stream_id and s.owner_id = p_owner_id);
$$;
revoke all on function live.stream_owned_by(uuid, uuid) from public, anon;
grant execute on function live.stream_owned_by(uuid, uuid) to authenticated;

-- Só o parceiro (nos próprios chats) e a moderação gerenciam. Quem foi silenciado ou banido não lê a tabela.
create policy "dono do chat e moderação leem" on live.chat_restrictions for select to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')));
create policy "dono do chat e moderação restringem" on live.chat_restrictions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')))
    and (stream_id is null or live.stream_owned_by(stream_id, owner_id))
  );
create policy "dono do chat e moderação alteram o prazo" on live.chat_restrictions for update to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')))
  with check (owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')));
create policy "dono do chat e moderação retiram" on live.chat_restrictions for delete to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')));

-- A pessoa logada está silenciada nesta transmissão ou banida dos chats do dono dela?
create or replace function live.chat_blocked(p_stream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from live.streams s
    join live.chat_restrictions r on r.owner_id = s.owner_id
    where s.id = p_stream_id and r.user_id = (select auth.uid())
      and (r.stream_id is null or r.stream_id = s.id)
      and (r.expires_at is null or r.expires_at > now())
  );
$$;
revoke all on function live.chat_blocked(uuid) from public, anon;
grant execute on function live.chat_blocked(uuid) to authenticated;

-- Enviar: as mesmas regras de antes, e quem está silenciado ou banido não envia.
drop policy "logado envia com o chat aberto" on live.chat_messages;
create policy "logado envia com o chat aberto" on live.chat_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and live.chat_is_open(stream_id)
    and not live.chat_blocked(stream_id)
    and is_host = live.is_stream_host(stream_id)
    and (reply_to is null or live.chat_message_in_stream(reply_to, stream_id))
  );
