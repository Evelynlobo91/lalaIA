# ADR 0002 — Acesso a dados: SQL direto nos adaptadores, Supabase para Auth/Realtime/Storage

- **Status:** aceito
- **Data:** 2026-09-29
- **Requisitos:** RNF06, RNF09, RF12, RF30

## Contexto

Usamos Supabase (Postgres + Auth + Realtime + Storage) rodando localmente via Docker.
Temos duas formas de ler e gravar dados:

1. `supabase-js` via API REST (PostgREST), que expõe tabelas diretamente para o navegador.
2. Um driver Postgres (`postgres`) no servidor, com SQL escrito à mão.

As consultas centrais do produto são espaciais e compostas: "perto de mim",
geofence de check-in e o score da recomendação. Além disso, cada módulo tem schema próprio
(ADR 0001).

## Decisão

- **Dados de negócio:** SQL direto com o driver `postgres`, **somente** em adaptadores
  `modules/<x>/infra/`, que implementam as portas do domínio. A conexão vem de
  `src/shared/db/sql.ts` (marcado como `server-only`).
- **Supabase client:** usado apenas para Auth, Realtime (status da live) e Storage.
- **Schemas de módulo** não são expostos pela API REST do Supabase.
- **Migrations em SQL puro** versionadas em `supabase/migrations/`; sem ORM.

## Consequências

- ✅ PostGIS e SQL expressivos, sem brigar com a abstração de um ORM.
- ✅ O domínio não sabe que existe Supabase: trocar o banco afeta só `infra/`.
- ✅ Menor superfície de ataque, porque o navegador não fala direto com as tabelas.
- ⚠️ Sem tipos gerados automaticamente: cada adaptador mapeia linhas para entidades
  e é coberto por teste de integração (`*.int.test.ts`).
