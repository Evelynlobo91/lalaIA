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
| `checkin` | Evento de domínio `missions.StepCompleted` (QR validado no balcão) | `mission` |

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

## Limitações conhecidas (POC)

- O endpoint de view é público e sem limite de taxa: alguém pode inflar visualizações com requisições
  diretas. Antes do painel ir para produção, adicionar rate limit por IP (sem gravar o IP) e/ou validar
  que a entidade existe.
- O bus é em processo: se o processo cair entre a resposta e a gravação, a interação se perde
  (aceitável para métrica; a evolução prevista é um outbox).
