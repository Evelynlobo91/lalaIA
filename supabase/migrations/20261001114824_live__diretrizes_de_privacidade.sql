-- live: aceite das diretrizes de privacidade e enquadramento de câmera (RNF16/RNF17).
-- Sem o aceite da versão vigente, o parceiro não gera a chave nem ativa uma transmissão.
create table live.broadcaster_agreements (
  owner_id            uuid primary key references auth.users (id) on delete cascade,
  -- Versão das diretrizes aceitas: quando o texto mudar, a versão nova pede um novo aceite.
  guidelines_version  text not null check (length(guidelines_version) between 1 and 20),
  privacy_ack_at      timestamptz not null default now()
);

comment on table live.broadcaster_agreements is 'Aceite das diretrizes de privacidade da Live (plano aberto e alto, sem áudio, aviso físico, LGPD).';

alter table live.broadcaster_agreements enable row level security;
grant select on live.broadcaster_agreements to authenticated;
grant insert (owner_id, guidelines_version, privacy_ack_at) on live.broadcaster_agreements to authenticated;
grant update (guidelines_version, privacy_ack_at) on live.broadcaster_agreements to authenticated;

create policy "parceiro lê o próprio aceite" on live.broadcaster_agreements for select to authenticated
  using (owner_id = (select auth.uid()));

-- Só em nome próprio e só parceiros (quem transmite).
create policy "parceiro registra o próprio aceite" on live.broadcaster_agreements for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select authz.has_role('partner')));

create policy "parceiro renova o próprio aceite" on live.broadcaster_agreements for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (select authz.has_role('partner')));
