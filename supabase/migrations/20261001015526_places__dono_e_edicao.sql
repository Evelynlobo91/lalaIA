-- places: dono do lugar (parceiro com vínculo aprovado) e edição protegida por RLS (RNF14).
alter table places.places
  add column managed_by uuid references auth.users (id) on delete set null;

create index places_managed_by_idx on places.places (managed_by) where managed_by is not null;

-- `authenticated` só para o backend agir "como o usuário" (asUser); o schema segue fora da API REST.
grant usage on schema places to authenticated;
alter table places.places enable row level security;
grant select on places.places to authenticated;
grant update (name, category, street, house_number, neighborhood, phone, website, opening_hours, edited_by_partner_at)
  on places.places to authenticated;

-- Dados de lugares são públicos para leitura.
create policy "todos leem" on places.places for select to authenticated using (true);

-- Só o dono (ou admin) altera, e só nas colunas liberadas acima (localização/origem nunca).
create policy "dono ou admin edita" on places.places for update to authenticated
  using (managed_by = (select auth.uid()) or (select authz.has_role('admin')))
  with check (managed_by = (select auth.uid()) or (select authz.has_role('admin')));
