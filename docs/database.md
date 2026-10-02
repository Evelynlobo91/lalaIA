# Banco de dados

Postgres 17 + PostGIS via **Supabase local** (Docker). Decisão de acesso a dados no
[ADR 0002](adr/0002-acesso-a-dados.md).

## Comandos

| Comando | O que faz |
|---------|-----------|
| `npm run db:start` | Sobe o Supabase local (Postgres, Auth, Realtime, Storage, Studio) |
| `npm run db:stop` | Para os containers (os dados continuam) |
| `npm run db:reset` | Recria o banco do zero: aplica todas as migrations + `supabase/seed.sql` |
| `npm run db:new <modulo>__<descricao>` | Cria uma migration nova |
| `npm run db:status` | Mostra URLs e chaves locais |
| `npm run test:int` | Testes de integração contra o banco local |

## Convenções

### Um schema por módulo
Cada módulo cria o próprio schema na sua primeira migration (`places`, `events`, `live`,
`missions`...). **Nunca** faça FK nem join entre schemas de módulos diferentes: guarde só o
ID (`place_id uuid not null`) e consulte o outro módulo pela API pública dele.

O schema `platform` é o kernel do banco (extensões e utilitários, como
`platform.set_updated_at()`) e pode ser usado por todos.

### Nome das migrations
`<timestamp>_<modulo>__<descricao>.sql`, por exemplo `20261001120000_places__criar_lugares.sql`.
A pasta é única (padrão do Supabase), e o prefixo do módulo deixa claro quem é o dono de cada arquivo.

### Integridade (RNF06)
A regra de negócio mora no código, mas os invariantes também ficam no banco:
- `not null`, `check` (ex.: `ends_at > starts_at`, `price >= 0`) e `unique` nas migrations
- Tipos espaciais como `extensions.geography(point, 4326)`, com índice `gist`
- `created_at`/`updated_at` como `timestamptz` + trigger `platform.set_updated_at`
- Tabelas de histórico (XP, analytics, ciclo de vida da live) são **append-only**

### Segurança
- Schemas de módulo não são expostos na API REST automática do Supabase
  (`revoke all ... from anon, authenticated`); o acesso passa pelo backend.
- **Tabelas com dono** (ex.: eventos de um parceiro) usam RLS como segunda camada de proteção.
  O backend grava e lê nelas com `asUser(userId, tx => ...)` (`src/shared/db/as-user.ts`), que roda
  a transação como o papel `authenticated` com `auth.uid()` igual ao usuário da sessão. Assim, mesmo
  que um caso de uso esqueça o filtro por dono, o banco não deixa acessar dados de outra pessoa.

#### Papéis
`identity.user_roles` guarda os papéis além do usuário comum: `partner` e `admin`. Nas políticas,
use `authz.has_role('partner')` / `authz.has_role('admin')` junto de `auth.uid()`. Revogar um papel
vale na hora. Para conceder ou revogar localmente:

```bash
npm run role -- grant admin voce@exemplo.com
npm run role -- revoke partner voce@exemplo.com
npm run role -- list voce@exemplo.com
```

#### Exemplo de tabela com dono

```sql
create schema if not exists events;
revoke all on schema events from anon;
grant usage on schema events to authenticated;          -- só para asUser; o schema segue fora da API REST

create table events.events (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id),
  title    text not null
);
alter table events.events enable row level security;
grant select, insert, update, delete on events.events to authenticated;

create policy "dono ou admin lê" on events.events for select to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_role('admin')));
create policy "parceiro cria o próprio" on events.events for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select authz.has_role('partner')));
create policy "dono ou admin altera" on events.events for update to authenticated
  using (owner_id = (select auth.uid()) or (select authz.has_role('admin')));
```

## Exemplo de migration de módulo

```sql
create schema if not exists places;
revoke all on schema places from anon, authenticated;

create table places.places (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  location    extensions.geography(point, 4326) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index places_location_idx on places.places using gist (location);
create trigger places_updated_at before update on places.places
  for each row execute function platform.set_updated_at();
```
