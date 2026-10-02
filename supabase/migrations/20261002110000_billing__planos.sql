-- billing: planos configuráveis e os recursos que cada um libera (#152).
create schema if not exists billing;
comment on schema billing is 'Módulo Cobrança: planos, assinaturas e faturas dos parceiros.';
revoke all on schema billing from public, anon;
-- `authenticated` só para o backend agir "como o usuário" (asUser) sob RLS; o schema segue fora da API REST.
grant usage on schema billing to authenticated;

create table billing.plans (
  id           uuid primary key default gen_random_uuid(),
  -- Identificador estável (ex.: 'basico', 'pro'), usado em URLs e relatórios.
  code         text not null unique check (code ~ '^[a-z][a-z0-9-]{1,29}$'),
  name         text not null check (length(trim(name)) between 2 and 60),
  description  text not null default '' check (length(description) <= 300),
  -- Mensalidade em centavos (0 = gratuito).
  price_cents  integer not null check (price_cents between 0 and 10000000),
  -- Recursos liberados. O catálogo fica no código (billing/domain/plan.ts).
  features     text[] not null default '{}' check (features <@ array['live', 'destaque', 'missoes', 'ofertas', 'cta', 'chat']),
  -- Plano de quem não tem assinatura.
  is_default   boolean not null default false,
  -- Inativo: não aceita novas assinaturas.
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- O plano padrão precisa estar ativo.
  check (not is_default or active)
);

-- Exatamente um padrão por vez.
create unique index plans_one_default_idx on billing.plans (is_default) where is_default;

create trigger plans_updated_at
  before update on billing.plans
  for each row execute function platform.set_updated_at();

alter table billing.plans enable row level security;
grant select, insert, update on billing.plans to authenticated;

-- RLS por capacidade (#157). O catálogo de planos não é segredo, mas a gestão é do financeiro.
create policy "financeiro lê planos" on billing.plans for select to authenticated
  using ((select authz.has_capability('billing:read')));
create policy "financeiro cria planos" on billing.plans for insert to authenticated
  with check ((select authz.has_capability('billing:write')));
create policy "financeiro altera planos" on billing.plans for update to authenticated
  using ((select authz.has_capability('billing:write')))
  with check ((select authz.has_capability('billing:write')));

-- Planos iniciais. O Básico (padrão) libera tudo o que já existe hoje, então nada muda para os parceiros atuais;
-- o Pro acrescenta os recursos pagos previstos (destaque, CTAs e chat). Os preços e a divisão dos recursos são
-- uma proposta: o time ajusta no backoffice.
insert into billing.plans (code, name, description, price_cents, features, is_default) values
  ('basico', 'Básico', 'Eventos, missões, ofertas e live para o seu negócio.', 0, array['live', 'missoes', 'ofertas'], true),
  ('pro', 'Pro', 'Tudo do Básico, mais destaque patrocinado, CTAs e chat nas lives.', 14900, array['live', 'missoes', 'ofertas', 'destaque', 'cta', 'chat'], false);
