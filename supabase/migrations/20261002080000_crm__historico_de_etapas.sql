-- crm: histórico de mudanças de etapa do lead (#148). Append-only: de, para, quem, quando e o motivo da perda.
create table crm.lead_stage_history (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references crm.leads (id) on delete cascade,
  from_stage  text not null check (from_stage in ('lead', 'contato', 'proposta', 'ativo', 'perdido')),
  to_stage    text not null check (to_stage in ('lead', 'contato', 'proposta', 'ativo', 'perdido')),
  -- Quem moveu. Se a conta for excluída, o registro fica sem autor.
  changed_by  uuid references auth.users (id) on delete set null,
  reason      text check (reason is null or length(reason) between 5 and 500),
  changed_at  timestamptz not null default now(),
  check (from_stage <> to_stage),
  -- Perda sempre registra o motivo.
  check (to_stage <> 'perdido' or reason is not null)
);

create index lead_stage_history_lead_idx on crm.lead_stage_history (lead_id, changed_at desc, id desc);

-- Append-only: o histórico não é alterado. DELETE só pela exclusão do lead (cascata).
create function crm.forbid_history_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'crm.lead_stage_history é append-only: % não é permitido', tg_op using errcode = 'restrict_violation';
end;
$$;

create trigger lead_stage_history_append_only
  before update on crm.lead_stage_history
  for each row execute function crm.forbid_history_update();

alter table crm.lead_stage_history enable row level security;
grant select, insert on crm.lead_stage_history to authenticated;

create policy "time lê o histórico" on crm.lead_stage_history for select to authenticated
  using ((select authz.has_capability('leads:read')));
create policy "time registra a mudança em seu nome" on crm.lead_stage_history for insert to authenticated
  with check ((select authz.has_capability('leads:write')) and changed_by = (select auth.uid()));
