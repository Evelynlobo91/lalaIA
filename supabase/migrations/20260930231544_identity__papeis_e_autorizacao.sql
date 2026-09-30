-- identity: papéis e autorização (RNF05, RNF14).
-- Todo usuário autenticado é "usuário comum"; papéis extras ficam registrados aqui.
create table identity.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('partner', 'admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);

-- Schema com funções de autorização para as políticas RLS dos módulos.
-- Só funções: nenhum dado fica aqui. O papel `authenticated` precisa de USAGE para
-- avaliar as políticas quando o backend executa consultas "como o usuário" (asUser).
create schema if not exists authz;
comment on schema authz is 'Funções de autorização usadas nas políticas RLS (auth.uid() + papéis).';
revoke all on schema authz from public, anon;
grant usage on schema authz to authenticated;

-- O usuário da requisição tem o papel? SECURITY DEFINER: lê identity.user_roles sem expor a tabela.
create or replace function authz.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from identity.user_roles
    where user_id = (select auth.uid()) and role = p_role
  );
$$;

revoke all on function authz.has_role(text) from public, anon;
grant execute on function authz.has_role(text) to authenticated;
