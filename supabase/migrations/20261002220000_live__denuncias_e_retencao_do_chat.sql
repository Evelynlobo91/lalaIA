-- live: denúncia de mensagem do chat e retenção (#95, slice #193; LGPD #25).

-- Denúncia: qualquer pessoa logada denuncia uma mensagem visível; vai para a moderação no backoffice.
create table live.chat_reports (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references live.chat_messages (id) on delete cascade,
  -- Conta excluída: a denúncia continua valendo, sem o denunciante.
  reporter_id  uuid references auth.users (id) on delete set null,
  reason       text not null check (reason in ('ofensa', 'assedio', 'spam', 'outro')),
  status       text not null default 'open' check (status in ('open', 'resolved')),
  -- Como a moderação resolveu: apagou a mensagem ou manteve.
  resolution   text check (resolution in ('removed', 'kept')),
  -- Só o id, sem FK (veja a nota sobre exclusão de conta no fim deste arquivo).
  resolved_by  uuid,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  check ((status = 'resolved') = (resolution is not null and resolved_at is not null))
);
-- Uma denúncia por pessoa e por mensagem.
create unique index chat_reports_once_idx on live.chat_reports (message_id, reporter_id);
create index chat_reports_open_idx on live.chat_reports (created_at desc) where status = 'open';

alter table live.chat_reports enable row level security;
revoke all on live.chat_reports from anon;
grant select on live.chat_reports to authenticated;
grant insert (message_id, reporter_id, reason) on live.chat_reports to authenticated;
grant update (status, resolution, resolved_by, resolved_at) on live.chat_reports to authenticated;

-- A mensagem existe e está visível? (quem denuncia não lê as mensagens dos outros na tabela)
create or replace function live.chat_message_reportable(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from live.chat_messages m
    where m.id = p_message_id and m.deleted_at is null and m.user_id is distinct from (select auth.uid())
  );
$$;
revoke all on function live.chat_message_reportable(uuid) from public, anon;
grant execute on function live.chat_message_reportable(uuid) to authenticated;

create policy "denunciante lê as próprias, moderação lê todas" on live.chat_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select authz.has_capability('content:edit')));
-- Denunciar: em nome próprio, mensagem visível e de outra pessoa.
create policy "logado denuncia mensagem visível de outra pessoa" on live.chat_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and live.chat_message_reportable(message_id));
create policy "moderação resolve" on live.chat_reports for update to authenticated
  using ((select authz.has_capability('content:edit')))
  with check ((select authz.has_capability('content:edit')) and resolved_by = (select auth.uid()));

-- Retenção (LGPD): mensagens ficam 30 dias para moderação e depois são apagadas de vez (curtidas e denúncias
-- saem em cascata). Na exclusão da conta, as mensagens ficam sem autor (user_id → null, "Usuário removido").
create or replace function live.purge_old_chat_messages(p_keep_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from live.chat_messages where created_at < now() - make_interval(days => greatest(p_keep_days, 1));
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function live.purge_old_chat_messages(integer) from public, anon, authenticated;

-- Todo dia, de madrugada (03:30 em Joinville = 06:30 UTC). Idempotente: reagendar com o mesmo nome substitui.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('live-chat-retention', '30 6 * * *', 'select live.purge_old_chat_messages()');

-- backoffice: resolver denúncia entra na trilha de auditoria.
alter table backoffice.audit_log drop constraint audit_log_target_type_check;
alter table backoffice.audit_log add constraint audit_log_target_type_check
  check (target_type in ('partner', 'place_claim', 'place', 'event', 'mission', 'user', 'live_cta', 'chat_message'));

-- Exclusão de conta: uma linha com DUAS colunas "on delete set null" para auth.users quebra quando a mesma
-- pessoa está nas duas e a linha também some em cascata na mesma exclusão (o segundo SET NULL reconfere a FK da
-- linha-mãe, que já foi apagada). Era o caso do anfitrião que apagou uma mensagem própria: user_id e deleted_by
-- eram ele, e a mensagem some com a transmissão. A exclusão da conta falhava. "Quem apagou" e "quem resolveu"
-- passam a ser só o id, sem FK (são registro de moderação; a conta pode não existir mais).
alter table live.chat_messages drop constraint chat_messages_deleted_by_fkey;
