-- places: cadastro de estabelecimento direto pelo admin (#143), sem depender do onboarding do parceiro.
alter table places.places drop constraint places_source_check;
alter table places.places add constraint places_source_check check (source in ('osm', 'partner', 'admin'));

-- Quem cadastrou (só para lugares criados no backoffice).
alter table places.places add column created_by uuid references auth.users (id) on delete set null;

-- O backend insere "como o admin" (asUser): só admin cria, e só com origem 'admin' em seu próprio nome.
grant insert (source, source_id, name, category, street, house_number, neighborhood, phone, website, location, edited_by_partner_at, created_by)
  on places.places to authenticated;

create policy "admin cadastra" on places.places for insert to authenticated
  with check ((select authz.has_role('admin')) and source = 'admin' and created_by = (select auth.uid()));
