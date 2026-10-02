-- crm: anotações do lead e próximo passo com data (#149).

-- Anotações: registro de cada contato. Não são editadas nem apagadas (só somem com o lead).
create table crm.lead_notes (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references crm.leads (id) on delete cascade,
  -- Quem anotou. Se a conta for excluída, a anotação fica sem autor.
  author_id   uuid references auth.users (id) on delete set null,
  body        text not null check (length(trim(body)) between 2 and 2000),
  created_at  timestamptz not null default now()
);
create index lead_notes_lead_idx on crm.lead_notes (lead_id, created_at desc, id desc);

alter table crm.lead_notes enable row level security;
grant select, insert on crm.lead_notes to authenticated;
create policy "time lê anotações" on crm.lead_notes for select to authenticated
  using ((select authz.has_capability('leads:read')));
create policy "time anota em seu nome" on crm.lead_notes for insert to authenticated
  with check ((select authz.has_capability('leads:write')) and author_id = (select auth.uid()));

-- Próximo passo: o que fazer e até quando. Cada lead tem no máximo um em aberto.
create table crm.lead_follow_ups (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references crm.leads (id) on delete cascade,
  description  text not null check (length(trim(description)) between 2 and 200),
  -- Dia combinado (calendário de Joinville), sem hora.
  due_on       date not null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  done_at      timestamptz,
  done_by      uuid references auth.users (id) on delete set null
);
create unique index lead_follow_ups_one_open_idx on crm.lead_follow_ups (lead_id) where done_at is null;
create index lead_follow_ups_due_idx on crm.lead_follow_ups (due_on) where done_at is null;

alter table crm.lead_follow_ups enable row level security;
grant select, insert, update on crm.lead_follow_ups to authenticated;
create policy "time lê follow-ups" on crm.lead_follow_ups for select to authenticated
  using ((select authz.has_capability('leads:read')));
create policy "time cria follow-ups em seu nome" on crm.lead_follow_ups for insert to authenticated
  with check ((select authz.has_capability('leads:write')) and created_by = (select auth.uid()));
create policy "time altera follow-ups" on crm.lead_follow_ups for update to authenticated
  using ((select authz.has_capability('leads:write')))
  with check ((select authz.has_capability('leads:write')));
