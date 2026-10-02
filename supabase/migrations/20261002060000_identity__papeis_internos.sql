-- identity: papéis internos por capacidade (#157). Além de `admin` (acesso total), o time ganha
-- `commercial`, `finance` e `moderator`; cada papel dá um conjunto de capacidades, e as políticas RLS
-- passam a perguntar pela capacidade (authz.has_capability), não pelo papel.

alter table identity.user_roles drop constraint user_roles_role_check;
alter table identity.user_roles add constraint user_roles_role_check check (role in ('partner', 'admin', 'commercial', 'finance', 'moderator'));

-- Papel → capacidades. Espelha `src/modules/identity/domain/capabilities.ts` (um teste de integração compara os dois).
create table authz.role_capabilities (
  role       text not null check (role in ('admin', 'commercial', 'finance', 'moderator')),
  capability text not null check (capability ~ '^[a-z]+:[a-z]+$'),
  primary key (role, capability)
);
comment on table authz.role_capabilities is 'Capacidades de cada papel interno. Só leitura para a aplicação (muda por migration).';
alter table authz.role_capabilities enable row level security;
revoke all on authz.role_capabilities from public, anon, authenticated;

insert into authz.role_capabilities (role, capability) values
  ('admin', 'backoffice:access'), ('admin', 'users:read'), ('admin', 'roles:manage'),
  ('admin', 'partners:review'), ('admin', 'partners:suspend'), ('admin', 'content:edit'),
  ('admin', 'leads:read'), ('admin', 'leads:write'),
  ('admin', 'billing:read'), ('admin', 'billing:write'),
  ('admin', 'metrics:read'), ('admin', 'audit:read'),
  ('commercial', 'backoffice:access'), ('commercial', 'leads:read'), ('commercial', 'leads:write'),
  ('finance', 'backoffice:access'), ('finance', 'billing:read'), ('finance', 'billing:write'),
  ('moderator', 'backoffice:access'), ('moderator', 'users:read'),
  ('moderator', 'partners:review'), ('moderator', 'partners:suspend'), ('moderator', 'content:edit');

-- O usuário da requisição tem a capacidade (por qualquer um dos seus papéis)?
create function authz.has_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from identity.user_roles r
    join authz.role_capabilities c on c.role = r.role
    where r.user_id = (select auth.uid()) and c.capability = p_capability
  );
$$;
revoke all on function authz.has_capability(text) from public, anon;
grant execute on function authz.has_capability(text) to authenticated;

-- Moderação de parceiros e vínculos: quem tem partners:review (admin e moderação).
alter policy "dono ou admin lê" on partners.partners
  using (owner_id = (select auth.uid()) or (select authz.has_capability('partners:review')));
alter policy "admin revisa" on partners.partners
  using ((select authz.has_capability('partners:review')))
  with check ((select authz.has_capability('partners:review')));
alter policy "parceiro lê os próprios, admin lê todos" on partners.place_claims
  using ((select partners.is_partner_owner(partner_id)) or (select authz.has_capability('partners:review')));
alter policy "admin revisa vínculo" on partners.place_claims
  using ((select authz.has_capability('partners:review')))
  with check ((select authz.has_capability('partners:review')));

-- Conteúdo (lugares, eventos, missões): o dono ou quem tem content:edit (admin e moderação).
alter policy "dono ou admin edita" on places.places
  using (managed_by = (select auth.uid()) or (select authz.has_capability('content:edit')))
  with check (managed_by = (select auth.uid()) or (select authz.has_capability('content:edit')));
alter policy "admin cadastra" on places.places
  with check ((select authz.has_capability('content:edit')) and source = 'admin' and created_by = (select auth.uid()));

alter policy "dono ou admin edita" on events.events
  using (owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')))
  with check (owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')));

alter policy "dono ou admin edita" on missions.missions
  using (owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')))
  with check (owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')));

-- Etapas das missões: mesma regra (as travas de "já aceita por alguém" continuam valendo).
alter policy "dono ou admin cria etapas" on missions.mission_steps
  with check (
    not missions.has_participants(mission_id)
    and exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_capability('content:edit'))))
  );
alter policy "dono ou admin altera etapas" on missions.mission_steps
  using (
    not missions.has_participants(mission_id)
    and exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_capability('content:edit'))))
  )
  with check (exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_capability('content:edit')))));
alter policy "dono ou admin remove etapas" on missions.mission_steps
  using (
    not missions.has_participants(mission_id)
    and exists (select 1 from missions.missions m where m.id = mission_id and (m.owner_id = (select auth.uid()) or (select authz.has_capability('content:edit'))))
  );

-- Auditoria (#146): conceder e revogar papel interno entra na trilha, com a pessoa como alvo.
alter table backoffice.audit_log drop constraint audit_log_target_type_check;
alter table backoffice.audit_log add constraint audit_log_target_type_check check (target_type in ('partner', 'place_claim', 'place', 'event', 'mission', 'user'));
