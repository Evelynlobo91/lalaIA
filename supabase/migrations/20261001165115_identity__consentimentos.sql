-- identity: consentimentos granulares e revogáveis (LGPD, #25). Uma linha por pessoa; sem linha = padrões.
-- `analytics`: contar as interações dela nas métricas (que já são anônimas; aqui ela pode sair de vez).
-- `geolocation`: oferecer "Perto de mim" (o GPS ainda é pedido pelo navegador a cada uso).
create table identity.consents (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  analytics    boolean not null default true,
  geolocation  boolean not null default true,
  updated_at   timestamptz not null default now()
);

comment on table identity.consents is 'Consentimentos LGPD por pessoa (revogáveis a qualquer momento em /perfil/privacidade).';

create trigger consents_updated_at
  before update on identity.consents
  for each row execute function platform.set_updated_at();

-- Só o backend acessa (o schema identity já é fechado para anon); o id vem sempre da sessão.
alter table identity.consents enable row level security;
