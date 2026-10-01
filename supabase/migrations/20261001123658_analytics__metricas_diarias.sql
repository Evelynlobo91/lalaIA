-- analytics: métricas diárias por entidade (#77). Materialized view com o total de cada tipo de interação
-- por dia (calendário de Joinville), atualizada a cada 10 minutos pelo pg_cron. O dia corrente é lido
-- direto de analytics.events (pequeno, pelo índice), então o painel nunca fica desatualizado.
create materialized view analytics.daily_metrics as
  select (occurred_at at time zone 'America/Sao_Paulo')::date as day,
         entity_type,
         entity_id,
         kind,
         count(*)::integer as total
  from analytics.events
  group by 1, 2, 3, 4
with data;

comment on materialized view analytics.daily_metrics is 'Interações por dia (fuso de Joinville), entidade e tipo. Só contagens (LGPD).';

-- Índice único: exigido pelo REFRESH ... CONCURRENTLY (leituras não bloqueiam durante o refresh).
create unique index daily_metrics_key on analytics.daily_metrics (entity_type, entity_id, day, kind);

-- Mesmo isolamento da tabela: só o backend lê (o schema já é fechado para anon/authenticated).
revoke all on analytics.daily_metrics from public, anon, authenticated;

create or replace function analytics.refresh_daily_metrics()
returns void
language sql
set search_path = ''
as $$
  refresh materialized view concurrently analytics.daily_metrics;
$$;

revoke all on function analytics.refresh_daily_metrics() from public, anon, authenticated;

-- Agendamento (pg_cron, disponível no Supabase local e no hospedado). Idempotente: reagendar com o
-- mesmo nome substitui o job.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('analytics-daily-metrics', '*/10 * * * *', 'select analytics.refresh_daily_metrics()');
