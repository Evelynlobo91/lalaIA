# Analytics (interações)

Base das métricas do parceiro (RF25): visualizações, favoritos, "Quero ir", acessos à live e check-ins,
registrados de forma uniforme numa tabela só.

## Como as interações chegam

| Tipo | Origem | Entidade |
|------|--------|----------|
| `view` | Tela: `<TrackView>` na página do lugar e do evento → `POST /api/analytics/track` | `place`, `event` |
| `live_view` | Tela: o player da Live renderiza `<TrackView kind="live_view" entityType="live">` quando o vídeo começa a tocar ([live](live.md)) | `live` (id da transmissão) |
| `favorite` | Evento de domínio `favorites.FavoriteAdded` | `place`, `event` |
| `quero_ir` | Evento de domínio `favorites.WantToGoClicked` | `place`, `event` |
| `checkin` | Eventos de domínio `missions.StepCompleted` (QR validado no balcão) e `partners.OfferValidated` (código de oferta validado no balcão) | `mission`; `place`, `event` |

- **Os módulos não chamam o Analytics:** ele assina os eventos de domínio deles (`subscriptions` no
  `index.ts`, registrado em `src/bootstrap`). Rastrear um novo evento é uma linha em `domainInteractions`
  (`features/tracking/tracking.use-case.ts`).
- O endpoint aceita **só visualizações** (`view`/`live_view`). Favorito, "Quero ir" e check-in não podem ser
  forjados pela tela: vêm dos próprios módulos.

## Não bloqueia a pessoa

- A gravação roda **depois da resposta** (`after` do Next, atrás da porta `BackgroundRunner`). O endpoint
  responde `202` na hora, e o assinante de domínio retorna sem esperar o banco.
- Falha ao gravar só é logada e reportada (Sentry). Nunca vira erro para o usuário.
- Na tela, `TrackView` usa `navigator.sendBeacon` (com `fetch` + `keepalive` de reserva) e conta **uma vez
  por aba** (`sessionStorage`), para recarregar não inflar o número.

## Banco e LGPD

- `analytics.events`: `kind`, `entity_type`, `entity_id`, `source` (`ui`/`domain`), `event_id`, `occurred_at`.
  **Sem `user_id`, IP ou user agent**: as métricas são por entidade, não por pessoa.
- Append-only (trigger recusa `UPDATE`); `DELETE` fica para uma política de retenção futura.
- Idempotente para eventos de domínio: `event_id` único + `on conflict do nothing`.
- Fora da API: `anon` e `authenticated` não têm acesso ao schema; RLS ligada e sem políticas.
- Índice `(entity_type, entity_id, kind, occurred_at desc)` para o painel do promotor (#77/#78).

## Totais por entidade (#54)

`interactionTotals(entityType, entityIds, since?)` (API pública, slice `features/interaction-totals`) devolve
`{ [entityId]: { view: 12, live_view: 3, ... } }`, desde `since` ou desde sempre:

- **Uma consulta agregada** (`count(*) ... group by entity_id, kind`) que filtra por `entity_type` e
  `entity_id = any(...)` e, se houver, `occurred_at >= since`: a ordem do índice `events_entity_idx`
  (o teste de integração confere que o plano usa o índice).
- Entrada validada com zod (tipo, até 200 ids, data). Só contagens: nada de quem fez.
- Usada pelas métricas da Live no portal do parceiro ([live](live.md)).

## Métricas diárias (#77)

- Materialized view `analytics.daily_metrics`: total por **dia de Joinville**, entidade e tipo. Índice único
  `(entity_type, entity_id, day, kind)`, que permite `refresh ... concurrently` (leituras não bloqueiam).
- **Refresh a cada 10 min pelo `pg_cron`** (job `analytics-daily-metrics`, criado na migration; chama
  `analytics.refresh_daily_metrics()`). No Supabase hospedado, o pg_cron já vem disponível.
- `dailyMetricsOf({ refs, from, to })` (API pública): dias fechados vêm da view; **hoje vem direto de
  `analytics.events`** pelo índice por entidade, então o número de hoje nunca fica atrasado pelo refresh.
  Uma consulta só (`union all`). Entrada com zod: até 500 ids por tipo, período de até 366 dias.
- A view segue fechada para `anon`/`authenticated`, como a tabela.

## Painel do promotor (#78)

- `/parceiro/dados` (e `GET /api/partner/dashboard?periodo=&recurso=`, só para parceiros: 401 sem sessão,
  403 sem o papel). Filtros na URL: período (7, 30 ou 90 dias), recurso (lugar, evento ou missão) e a
  métrica do gráfico.
- **As 6 métricas:** visualizações, favoritos, "Quero ir", acessos à live, check-ins e conversão
  (("Quero ir" + check-ins) ÷ visualizações). Cada uma com o total, a variação contra o período anterior
  (em texto + ícone) e a série diária. Detalhamento por recurso numa tabela.
- **Isolamento entre parceiros:** o schema `analytics` não é acessível pela API; o que entra no painel são só
  os recursos do próprio parceiro, resolvidos no servidor a partir do id da sessão pelas APIs públicas
  dos módulos donos (lugares que ele gerencia, eventos e missões que criou, transmissões dele), que já
  respeitam a RLS de cada módulo. Recurso de outro parceiro na URL → 404. Essa porta (`PartnerResources`)
  é montada em `src/bootstrap/partner-resources.ts`, para o analytics não depender de live (que depende dele).
- Gráfico: barras diárias de uma métrica por vez (uma série, sem legenda; o título nomeia), tooltip por dia,
  alvo de toque maior que a barra e **"Ver em tabela"** como alternativa acessível.
- "Visualizações" contam uma vez por aba aberta; não há contagem de pessoas únicas (não guardamos quem fez).

## Limitações conhecidas (POC)

- O endpoint de view é público e sem limite de taxa: alguém pode inflar visualizações com requisições
  diretas. Antes do painel ir para produção, adicionar rate limit por IP (sem gravar o IP) e/ou validar
  que a entidade existe.
- O bus é em processo: se o processo cair entre a resposta e a gravação, a interação se perde
  (aceitável para métrica; a evolução prevista é um outbox).
