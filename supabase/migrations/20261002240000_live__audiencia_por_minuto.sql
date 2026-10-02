-- live: amostra da audiência por minuto (#56). Serve para dimensionar e para os alertas de consumo:
-- espectadores-minuto do mês (o que o provedor de vídeo cobra, em minutos entregues) e o pico de cada live.
-- Só contagens por transmissão; nada sobre quem assiste.
create table live.audience_samples (
  minute     timestamptz not null,
  stream_id  uuid not null references live.streams (id) on delete cascade,
  viewers    integer not null check (viewers > 0),
  primary key (minute, stream_id)
);
create index audience_samples_stream_idx on live.audience_samples (stream_id, minute desc);

alter table live.audience_samples enable row level security;
revoke all on live.audience_samples from anon, authenticated;

-- Tira a foto de quem está assistindo agora (abas com batimento nos últimos 15 s) e apaga amostras antigas.
create or replace function live.sample_audience()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sampled integer;
begin
  insert into live.audience_samples (minute, stream_id, viewers)
  select date_trunc('minute', now()), v.stream_id, count(*)::int
  from live.viewers v
  join live.streams s on s.id = v.stream_id and s.status = 'live'
  where v.seen_at >= now() - interval '15 seconds'
  group by v.stream_id
  on conflict (minute, stream_id) do update set viewers = greatest(live.audience_samples.viewers, excluded.viewers);
  get diagnostics sampled = row_count;
  delete from live.audience_samples where minute < now() - interval '90 days';
  return sampled;
end;
$$;
revoke all on function live.sample_audience() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('live-audience-sample', '* * * * *', 'select live.sample_audience()');
