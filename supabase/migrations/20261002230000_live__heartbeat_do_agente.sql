-- live: heartbeat do agente de borrão de rostos (#97, slice #198). O agente de borda avisa, a cada ~10 s, que
-- está transmitindo com o modo privacidade ligado. Só números: nunca imagem nem rosto. Guarda só o último.
create table live.agent_heartbeats (
  stream_id        uuid primary key references live.streams (id) on delete cascade,
  privacy_mode     text not null check (privacy_mode in ('on', 'off')),
  -- 'faces' = só os rostos borrados; 'full' = quadro inteiro borrado (detector com falha: proteção contra falha).
  blur_mode        text not null check (blur_mode in ('faces', 'full')),
  fps              numeric(5, 1) not null check (fps between 0 and 240),
  faces_per_frame  numeric(6, 2) not null check (faces_per_frame between 0 and 1000),
  detector_status  text not null check (char_length(detector_status) between 1 and 60),
  received_at      timestamptz not null default now()
);

-- Só o backend lê e grava (o agente se autentica pela chave de transmissão, não por uma conta).
alter table live.agent_heartbeats enable row level security;
revoke all on live.agent_heartbeats from anon, authenticated;
