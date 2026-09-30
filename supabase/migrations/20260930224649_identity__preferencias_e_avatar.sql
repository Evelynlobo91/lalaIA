-- identity: preferências do usuário e foto de perfil (RF03, RNF06).

alter table identity.profiles
  add column avatar_path text check (avatar_path is null or length(avatar_path) <= 300);

-- Preferências usadas pela recomendação (pergunta-guia: orçamento, distância, com quem, gostos).
create table identity.preferences (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  categories  text[] not null default '{}' check (cardinality(categories) <= 20),
  budget_max  integer check (budget_max is null or budget_max between 0 and 10000),
  radius_km   integer not null default 10 check (radius_km between 1 and 50),
  group_size  text check (group_size is null or group_size in ('sozinho', 'casal', 'amigos', 'familia')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger preferences_updated_at
  before update on identity.preferences
  for each row execute function platform.set_updated_at();

-- Foto de perfil no Supabase Storage. Leitura pública (a URL leva o id do usuário e um carimbo de tempo);
-- escrita só na pasta do próprio usuário: avatars/<user_id>/<arquivo>.
-- Guardado por to_regclass: ambientes só com Postgres (CI de integração) não têm o schema storage.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'schema storage ausente: bucket e políticas de avatar não criados';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "avatar: dono envia" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
  execute $p$
    create policy "avatar: dono atualiza" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
  execute $p$
    create policy "avatar: dono remove" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
end;
$$;
