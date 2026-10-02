-- live: CTAs programados (#93, slice #178). Chamadas para ação que aparecem sobre o player em horários
-- definidos pelo parceiro: promoção, missão, "Quero ir", evento ou link. Um por vez (prioridade).
create table live.ctas (
  id                uuid primary key default gen_random_uuid(),
  stream_id         uuid not null references live.streams (id) on delete cascade,
  owner_id          uuid not null references auth.users (id) on delete cascade,
  type              text not null check (type in ('promocao', 'missao', 'quero-ir', 'evento', 'link')),
  -- Oferta, missão ou evento de outro módulo: só o id, sem FK entre schemas.
  ref_id            uuid,
  -- Destino do toque, resolvido pelo tipo na hora de salvar (página do app ou endereço externo https).
  href              text not null check (char_length(href) between 1 and 600 and (href like '/%' or href like 'https://%')),
  external          boolean not null default false,
  title             text not null check (char_length(title) between 3 and 60),
  body              text check (body is null or char_length(body) between 1 and 140),
  button_label      text not null check (char_length(button_label) between 2 and 24),
  -- 1 = alta, 2 = normal, 3 = baixa. Se dois coincidirem, aparece o de maior prioridade.
  priority          smallint not null default 2 check (priority between 1 and 3),
  -- Agendamento: horário absoluto; relativo ao início da live; ou recorrente a partir do início da live.
  schedule_kind     text not null check (schedule_kind in ('absolute', 'relative', 'recurring')),
  starts_at         timestamptz,
  ends_at           timestamptz,
  offset_minutes    integer check (offset_minutes between 0 and 720),
  duration_minutes  integer check (duration_minutes between 1 and 180),
  interval_minutes  integer check (interval_minutes between 5 and 720),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint ctas_schedule_shape check (
    case schedule_kind
      when 'absolute' then starts_at is not null and ends_at is not null and ends_at > starts_at and ends_at <= starts_at + interval '24 hours'
                           and offset_minutes is null and duration_minutes is null and interval_minutes is null
      when 'relative' then offset_minutes is not null and duration_minutes is not null
                           and starts_at is null and ends_at is null and interval_minutes is null
      else interval_minutes is not null and duration_minutes is not null and duration_minutes < interval_minutes
           and starts_at is null and ends_at is null and offset_minutes is null
    end
  ),
  constraint ctas_external_href check (external = (href like 'https://%'))
);

create index ctas_stream_idx on live.ctas (stream_id, priority, created_at);

create trigger ctas_updated_at
  before update on live.ctas
  for each row execute function platform.set_updated_at();

alter table live.ctas enable row level security;
revoke all on live.ctas from anon;
grant select, delete on live.ctas to authenticated;
grant insert (stream_id, owner_id, type, ref_id, href, external, title, body, button_label, priority, schedule_kind, starts_at, ends_at, offset_minutes, duration_minutes, interval_minutes)
  on live.ctas to authenticated;
-- O vínculo com a transmissão e o dono nunca mudam.
grant update (type, ref_id, href, external, title, body, button_label, priority, schedule_kind, starts_at, ends_at, offset_minutes, duration_minutes, interval_minutes)
  on live.ctas to authenticated;

-- O público não lê esta tabela: o CTA ativo sai pelo backend, junto do status da live.
create policy "dono lê os próprios, admin lê todos" on live.ctas for select to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_role('admin')));

create policy "dono cria na própria transmissão" on live.ctas for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from live.streams s where s.id = stream_id and s.owner_id = (select auth.uid()))
  );

create policy "dono altera os próprios" on live.ctas for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "dono remove os próprios" on live.ctas for delete to authenticated
  using (owner_id = (select auth.uid()));
