# Live (transmissões ao vivo)

Estabelecimentos e promotores mostram o ambiente ao vivo; quem está decidindo aonde ir vê antes
(**Veja → decida → vá**). **A plataforma não faz streaming:** o parceiro transmite do OBS/Larix direto
para o provedor (Mux) com uma chave por lugar/evento, e o app só embute a URL HLS.

```
OBS/Larix ──RTMPS + chave──► Mux ──webhooks assinados──► POST /api/live/webhooks ──► status + log de ciclo de vida
                              │                                                      └─► live.StreamStatusChanged
                              └──HLS──► player na página do lugar/evento (hls.js sob demanda)
```

## Provedor atrás de uma porta (DIP)

`StreamingProvider` (`src/modules/live/domain/streaming-provider.ts`): `createStream`, `resetStreamKey`,
`disable` (efeito imediato), `enable`, `playbackUrl` e `verifyWebhook` (assinatura + eventos normalizados).
Trocar Mux por Cloudflare Stream é uma nova implementação, sem mudar os casos de uso.

| Adaptador | Quando | O que faz |
|-----------|--------|-----------|
| `MuxStreamingProvider` | `MUX_TOKEN_ID` definido | REST do Mux via `fetch` (Basic auth), live stream de **baixa latência** e **sem gravação** |
| `FakeStreamingProvider` | sem `MUX_TOKEN_ID` (dev/E2E) | gera a chave localmente, não transmite nada e toca uma stream HLS pública de teste |

As variáveis são validadas com zod no servidor, no primeiro uso, **sem valor padrão de segredo** em
nenhum ambiente. Páginas sem live não exigem a configuração.

## Chave de transmissão (#47, RF18)

- **Portal:** `/parceiro/live` lista os lugares que o parceiro administra (`placesManagedBy`) e os
  eventos dele ainda não terminados (`eventsByOwner`). "Gerar chave de transmissão" cria a live stream
  no provedor e a vincula ao lugar/evento (**uma por lugar/evento**; pedir de novo devolve a mesma).
- A posse é conferida no caso de uso pelas APIs públicas de `places` e `events` (`editableEvent` para
  um evento), sem consultar as tabelas deles.
- **Instruções** de OBS Studio e Larix Broadcaster no portal, com o servidor
  `rtmps://global-live.mux.com:443/app`.
- **Gerar nova chave** (com confirmação) chama `resetStreamKey` no provedor: a chave anterior para de
  funcionar na hora.

### Só o dono vê a chave

| Camada | Defesa |
|--------|--------|
| Tela | Mascarada por padrão. A chave **não vai no HTML**: só chega ao navegador quando o dono clica em "Revelar" ou "Copiar" (Server Action). |
| Caso de uso | `RevealStreamKey`/`RotateStreamKey` exigem ser o dono (nem o admin vê). O id vem da sessão (`withUser`). |
| Banco | A chave fica em `live.stream_credentials`, separada de `live.streams`. RLS: **só o dono** lê e rotaciona; o backend lê com `asUser`. A leitura pública nunca toca nessa tabela. |
| Column grants | Como usuário, em `live.streams` só a coluna `control` é alterável: dono, vínculo, provedor e sinal não. |

## Webhooks e ciclo de vida (#48, RNF18)

`POST /api/live/webhooks` (`features/webhooks`):

1. Lê o **corpo cru** (até 64 KB; acima disso, 413 sem verificar) e confere o header
   `mux-signature: t=<ts>,v1=<hex>` = HMAC-SHA256 de `"<ts>.<corpo>"` com `MUX_WEBHOOK_SECRET`
   (ou `LIVE_FAKE_WEBHOOK_SECRET` no simulado). Comparação em **tempo constante** e **tolerância de 5 min**
   (anti-replay). Assinatura inválida, ausente ou fora da janela → **401**, sem gravar nada.
2. Normaliza os eventos `video.live_stream.*` (`connected`, `active`, `disconnected`, `idle`, `enabled`,
   `disabled`); outros tipos (assets etc.) são aceitos e ignorados (200, para o Mux não reenviar).
3. Numa **transação**, com a transmissão travada (`for update`): grava em
   `live.stream_lifecycle_events` e aplica o novo sinal.
4. Publica `live.StreamStatusChanged { streamId, entityType, entityId, status }` **depois de gravar** e
   só quando o status muda.

| Garantia | Como |
|----------|------|
| Idempotência | `provider_event_id` único + `on conflict do nothing`: reenvio do mesmo evento não grava nem publica de novo |
| Ordem | Webhooks podem chegar fora de ordem: evento mais antigo que a última mudança de sinal é registrado, mas não muda o status (`signalAfter`) |
| Append-only | Trigger recusa `UPDATE`, `DELETE` e `TRUNCATE` para qualquer papel; só a exclusão em cascata da conta (LGPD) passa |
| Quem grava | Eventos do provedor: só o backend (a autenticação do webhook é a assinatura). Ações do parceiro: o próprio dono/admin, com `asUser` e RLS |
| Transmissão desconhecida | Ignorada com log de aviso (200) |

O status exibido é uma coluna **gerada** a partir do controle do parceiro e do sinal:

| Controle \ Sinal | `offline` | `live` |
|------------------|-----------|--------|
| `on` | `waiting` (aguardando sinal) | `live` (ao vivo) |
| `paused` | `paused` | `paused` |
| `ended` | `ended` | `ended` |

Webhook nunca muda o controle: uma live pausada continua pausada quando o sinal volta.

## Ativar, pausar e encerrar (#49, RF23/RNF15)

Botões no card de cada transmissão em `/parceiro/live` (`features/stream-control`):

| Ação | Efeito | Provedor |
|------|--------|----------|
| **Pausar** | Status `paused`: o player some da página, mas o OBS/Larix continua conectado | nada (ingestão continua) |
| **Ativar** | Volta a `on`: ao vivo de novo na hora se o sinal estiver chegando | `enable` se estava encerrada |
| **Encerrar** (com confirmação) | Status `ended` | `disable` **antes** de gravar: a ingestão cai na hora |

- **Quem:** só o dono ou admin (caso de uso + RLS em `live.streams`, que só libera a coluna `control`).
  Cada ação vai para o log de ciclo de vida com quem agiu, na mesma transação. Rotacionar a chave também
  fica no log (sem a chave).
- **Idempotente:** repetir a ação não chama o provedor nem publica de novo. Se o banco falhar depois do
  `disable`, repetir "Encerrar" completa.
- **Evento cancelado** (`events.EventCancelled`, assinado em `src/bootstrap`) encerra a live do evento
  automaticamente (registrado no log como `system`).
- O player some "em segundos": a página do público consulta o status a cada ~12 s (veja #51).

## Player na página do lugar e do evento (#50, RF19/RF22)

- `<LivePlayerFor entityType entityId title />` (server component, exportado pelo `index.ts`) entra no slot
  `extras` de `PlaceDetailCard` e `EventDetailCard`, dentro de um `Suspense`: esses componentes não
  conhecem o módulo live. Sem transmissão, não renderiza nada; se a consulta falhar, registra o erro e a
  página continua (a live é um complemento).
- **Sob demanda:** o player entra com `next/dynamic` (`ssr: false`) só quando há live no ar. Safari/iOS
  (e quem tem HLS nativo) tocam direto no `<video>`; nos demais, o `hls.js` (Apache-2.0) é baixado por
  import dinâmico, com **bitrate adaptativo** e `lowLatencyMode`.
- **Privacidade (RNF16):** sempre começa **mudo**, com `playsInline` (não abre em tela cheia no iPhone).
  A live stream é criada **sem gravação**. Aviso curto de privacidade no portal (a #55 completa).
- **Analytics:** quando o vídeo começa a tocar, renderiza `<TrackView kind="live_view" entityType="live"
  entityId={streamId}>` (módulo analytics), passado pelo server component.
- A URL HLS só é entregue quando o status é `live` (pausada/encerrada não expõe a URL).
- **Para Recomendação e Mapa:** `listActiveStreams(limit?)` devolve `{ streamId, entityType, entityId }`
  das lives no ar (só ids; quem chama busca os próprios dados). Veja o #52 abaixo.

## Estados da live (#51, RNF20)

`LiveStage` (`features/stream-states/ui`) mostra uma mensagem clara para cada estado, com `role="status"`
(leitores de tela anunciam a troca):

| Estado | Quando | O que aparece |
|--------|--------|---------------|
| Aguardando sinal | Chave gerada, sem vídeo chegando | "A transmissão começa em instantes. Esta área se atualiza sozinha." |
| Ao vivo | Sinal chegando e controle `on` | Selo "Ao vivo" + player mudo |
| Pausada | Parceiro pausou | "O responsável pausou a live..." (sem player) |
| Encerrada | Parceiro encerrou (ou evento cancelado) | "A live terminou..." (só para quem estava na página; quem chega depois não vê o bloco) |
| Indisponível | Erro irrecuperável do player (rede, stream fora do ar) | Mensagem + **Tentar de novo** |

**Transição sem recarregar (POC):** polling leve de
`GET /api/live/status?entityType=place|event&entityId=<uuid>` a cada **12 s** (`LIVE_STATUS_POLL_MS`),
**só com a aba visível** (`visibilitychange`: aba em segundo plano não consulta; ao voltar, consulta na
hora). A resposta é pública e mínima (`status`, `streamId` e a URL HLS só quando ao vivo), validada com
zod e com `Cache-Control: no-store`. Mesmo status e URL não remontam o player.

### Evolução: Supabase Realtime

O polling fica atrás do hook `useLiveStatus` (fachada). Para trocar por push:

1. Publicar o status numa tabela/canal de leitura pública (ex.: `live.stream_status` só com
   `entity_type`, `entity_id`, `status`, sem chave nem dono) e adicioná-la à publication `supabase_realtime`,
   ou usar *Broadcast* a partir de um assinante de `live.StreamStatusChanged`.
2. No hook, assinar `postgres_changes`/broadcast filtrando por `entity_id` e manter o polling como reserva
   (ex.: a cada 60 s) para reconexões.

Ficou para depois porque o Realtime está desligado no CI de E2E (`supabase start -x realtime`).

## Selo "Ao vivo", lista e mapa (#52, RF20/RF24)

`features/live-badge`. As consultas leem `live.streams` pelo índice parcial `streams_live_idx`
(`status = 'live'`) e buscam nome, lugar, horário e coordenadas pelas APIs públicas de places
(`placeSummaries`, `placePoints`) e events (`eventSummaries`), no adaptador `ModuleLiveTargetDirectory`.
Assim são no máximo quatro consultas, qualquer que seja a quantidade de lives.

| Onde | Como |
|------|------|
| Cards de lugares e eventos (`/lugares`, `/eventos`) | Os cards renderizam `<LiveNowBadge>` (shared/ui), que lê o `LiveNowContext`. A página envolve a lista com `<LiveNowProvider initial={await liveNowKeys()}>` (módulo live). **places e events não importam live.** Sem provider, nenhum selo aparece. |
| Detalhe do lugar/evento | Selo no cabeçalho (mesmo `LiveNowBadge`) + o selo do player (`LiveStage`, #51). |
| Mapa (`/mapa`) | Camada `MapLayer` "lives" (`liveMapLayer`), somada por `<LiveMapLayers>` em volta do `PlacesMap` via `MapLayersContext` (shared/ui/map). Marcador vermelho com "AO VIVO"; o toque abre um resumo com "Ver a live". Dados de `GET /api/live/map` (GeoJSON). |
| Lista "Com live agora" (`/ao-vivo`) | `liveNow()` → `<LiveNowList>`. Links nas listas de lugares e eventos e no mapa (alternativa acessível ao mapa). |
| Recomendação | A porta `LiveStatusReader` usa `LiveStreamsStatus` → `listActiveStreams()` (o stub `NoLiveYet` foi removido). |

**Atualização na POC:** polling leve de `GET /api/live/active` (`{ streams: [{ entityType, entityId }] }`)
a cada **30 s** (`LIVE_NOW_POLL_MS`), só com a aba visível (`pollWhileVisible`, o mesmo do #51). O mapa
recarrega o GeoJSON no mesmo ritmo. As duas respostas são públicas, iguais para todo mundo e com cache curto
na CDN (`s-maxage=10`): mil pessoas na lista não viram mil consultas ao banco.

**Evolução: Supabase Realtime.** O `LiveNowProvider` é a fachada: basta assinar mudanças de uma tabela/canal
público de status (veja "Evolução" no #51) e aplicar no mesmo conjunto, mantendo o polling como reserva.

## Configurar o Mux

1. Crie uma conta em [mux.com](https://mux.com) e um **Environment** (ex.: Production).
2. **Settings → Access Tokens → Generate new token**, com permissão **Mux Video: Read + Write**.
   Guarde `MUX_TOKEN_ID` e `MUX_TOKEN_SECRET` (o segredo só aparece uma vez).
3. **Settings → Webhooks → Create new webhook**, no mesmo environment:
   - URL: `https://<seu-domínio>/api/live/webhooks`
   - Copie o **Signing Secret** para `MUX_WEBHOOK_SECRET`.
4. Cadastre as três variáveis na Vercel (Production; e Preview, se quiser Mux nos previews). Veja
   [deploy](deploy.md).
5. Teste: gere a chave no portal, transmita pelo OBS e confira a live ficar "Ao vivo" em alguns segundos.

> Para testar webhooks localmente com Mux de verdade, exponha o `localhost:3000` com um túnel
> (ex.: `cloudflared tunnel --url http://localhost:3000`) e use a URL do túnel no passo 3.

### Desenvolvimento sem Mux

Deixe `MUX_TOKEN_ID` vazio e defina `LIVE_FAKE_WEBHOOK_SECRET` (mínimo 32 caracteres) no `.env.local`.
O portal avisa que o provedor é simulado.

## Borrão de rostos na origem (#97, fase 1)

O vídeo é borrado **antes de sair do estabelecimento**, por um agente de borda em
[`tools/face-blur-agent`](../tools/face-blur-agent/README.md) (ou pelo OBS com o plugin obs-detect). A
plataforma nunca recebe o vídeo original. Detecção, nunca reconhecimento; nada é gravado. Se o detector
falhar, o agente borra o quadro inteiro. A exigência de "modo privacidade confirmado" para ativar a live
entra no portal junto com o checklist de privacidade (#55).

