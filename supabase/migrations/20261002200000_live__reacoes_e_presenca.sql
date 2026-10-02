-- live: curtir a live, reações rápidas, curtir mensagem e espectadores agora (#95, slices #189, #190 e #191).

-- Quem interage não lê live.streams (RLS: só dono e admin). Responde só sim/não.
create or replace function live.stream_is_live(p_stream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from live.streams s where s.id = p_stream_id and s.status = 'live' and not platform.owner_suspended(s.owner_id));
$$;
revoke all on function live.stream_is_live(uuid) from public, anon;
grant execute on function live.stream_is_live(uuid) to authenticated;

-- Curtir a live: uma vez por pessoa (o contador é a contagem das linhas).
create table live.stream_likes (
  stream_id   uuid not null references live.streams (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (stream_id, user_id)
);
alter table live.stream_likes enable row level security;
revoke all on live.stream_likes from anon;
grant select, insert, delete on live.stream_likes to authenticated;
create policy "cada um lê a própria curtida" on live.stream_likes for select to authenticated using (user_id = (select auth.uid()));
create policy "cada um curte a live no ar" on live.stream_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and live.stream_is_live(stream_id));
create policy "cada um desfaz a própria curtida" on live.stream_likes for delete to authenticated using (user_id = (select auth.uid()));

-- Reações rápidas: efêmeras, não são guardadas uma a uma nem por pessoa. Só o total por tipo, somado pelo
-- backend depois de validar e limitar o lote. Ninguém lê nem escreve aqui como usuário.
create table live.reaction_counters (
  stream_id  uuid not null references live.streams (id) on delete cascade,
  kind       text not null check (kind in ('heart', 'fire', 'laugh', 'clap', 'cheers')),
  total      bigint not null default 0 check (total >= 0),
  primary key (stream_id, kind)
);
alter table live.reaction_counters enable row level security;
revoke all on live.reaction_counters from anon, authenticated;

-- Curtir mensagem do chat: uma vez por pessoa, só mensagem visível.
create table live.chat_message_likes (
  message_id  uuid not null references live.chat_messages (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index chat_message_likes_user_idx on live.chat_message_likes (user_id);

create or replace function live.chat_message_is_likable(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from live.chat_messages m where m.id = p_message_id and m.deleted_at is null and live.chat_is_open(m.stream_id));
$$;
revoke all on function live.chat_message_is_likable(uuid) from public, anon;
grant execute on function live.chat_message_is_likable(uuid) to authenticated;

alter table live.chat_message_likes enable row level security;
revoke all on live.chat_message_likes from anon;
grant select, insert, delete on live.chat_message_likes to authenticated;
create policy "cada um lê as próprias curtidas" on live.chat_message_likes for select to authenticated using (user_id = (select auth.uid()));
create policy "cada um curte mensagem visível com o chat aberto" on live.chat_message_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and live.chat_message_is_likable(message_id));
create policy "cada um desfaz a própria curtida" on live.chat_message_likes for delete to authenticated using (user_id = (select auth.uid()));

-- Espectadores agora: batimento de cada aba com a live aberta. Efêmero (unlogged: não sobrevive a queda do
-- banco, e não precisa). `viewer_id` é um id aleatório da aba, sem relação com a conta (LGPD: não diz quem assiste).
create unlogged table live.viewers (
  stream_id  uuid not null references live.streams (id) on delete cascade,
  viewer_id  text not null check (viewer_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  seen_at    timestamptz not null default now(),
  primary key (stream_id, viewer_id)
);
create index viewers_seen_idx on live.viewers (stream_id, seen_at);
alter table live.viewers enable row level security;
revoke all on live.viewers from anon, authenticated;
