-- CTAs nas lives (#93, slice #182): impressões e cliques no tracking e desativação pela moderação.

-- analytics: dois tipos de interação novos, por CTA. Seguem a mesma regra da tabela: só o quê, onde e quando.
alter table analytics.events drop constraint events_kind_check;
alter table analytics.events add constraint events_kind_check
  check (kind in ('view', 'favorite', 'quero_ir', 'live_view', 'checkin', 'cta_impression', 'cta_click'));
alter table analytics.events drop constraint events_entity_type_check;
alter table analytics.events add constraint events_entity_type_check
  check (entity_type in ('place', 'event', 'mission', 'live', 'cta'));
-- Os tipos de CTA só valem para a entidade CTA, e vice-versa.
alter table analytics.events add constraint events_cta_kind_check
  check ((entity_type = 'cta') = (kind in ('cta_impression', 'cta_click')));

comment on schema analytics is 'Módulo Analytics: interações (view, favorite, quero_ir, live_view, checkin, cta_impression, cta_click) e agregações.';

-- live: a moderação (capacidade content:edit) pode desativar uma chamada; desativada, ela não aparece no player.
alter table live.ctas
  add column disabled_at timestamptz,
  add column disabled_by uuid references auth.users (id) on delete set null;

grant update (disabled_at, disabled_by) on live.ctas to authenticated;

drop policy "dono lê os próprios, admin lê todos" on live.ctas;
create policy "dono lê os próprios, moderação lê todos" on live.ctas for select to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')));

create policy "moderação desativa e reativa" on live.ctas for update to authenticated
  using ((select authz.has_capability('content:edit')))
  with check ((select authz.has_capability('content:edit')));

-- A política acima abre o UPDATE para a moderação, e a do dono abre para o dono: cada um só nas suas colunas.
-- O dono não reativa o que a moderação desativou, e a moderação não reescreve a chamada do parceiro.
create or replace function live.guard_cta_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  moderation_changed boolean := (new.disabled_at is distinct from old.disabled_at) or (new.disabled_by is distinct from old.disabled_by);
  content_changed boolean := (to_jsonb(new) - 'disabled_at' - 'disabled_by' - 'updated_at') is distinct from (to_jsonb(old) - 'disabled_at' - 'disabled_by' - 'updated_at');
begin
  -- Backend sem usuário (migrações, manutenção): sem restrição.
  if (select auth.uid()) is null then
    return new;
  end if;
  if moderation_changed and not (select authz.has_capability('content:edit')) then
    raise exception 'só a moderação desativa ou reativa uma chamada' using errcode = '42501';
  end if;
  if content_changed and old.owner_id <> (select auth.uid()) then
    raise exception 'só o dono altera a própria chamada' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger ctas_guard_moderation
  before update on live.ctas
  for each row execute function live.guard_cta_moderation();

-- backoffice: desativar/reativar chamada entra na trilha de auditoria.
alter table backoffice.audit_log drop constraint audit_log_target_type_check;
alter table backoffice.audit_log add constraint audit_log_target_type_check
  check (target_type in ('partner', 'place_claim', 'place', 'event', 'mission', 'user', 'live_cta'));
