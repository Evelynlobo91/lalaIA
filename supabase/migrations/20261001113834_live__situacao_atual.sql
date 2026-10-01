-- live: situação atual da transmissão (RF21). Texto curto que o parceiro edita no portal
-- (ex.: "Show começa 22h", "Casa cheia") e aparece junto do player para o público.
alter table live.streams
  add column status_note text check (status_note is null or char_length(status_note) between 1 and 80),
  add column status_note_updated_at timestamptz;

comment on column live.streams.status_note is 'Situação atual definida pelo parceiro (público). Sem dados pessoais.';

-- Como usuário (asUser + RLS "dono ou admin controla"), além do controle só a situação muda.
grant update (status_note, status_note_updated_at) on live.streams to authenticated;
