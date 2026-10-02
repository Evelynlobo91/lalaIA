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
| Column grants | Como usuário, em `live.streams` só `control` e a situação atual (#53) são alteráveis: dono, vínculo, provedor e sinal não. |

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
  A live stream é criada **sem gravação**. Aviso curto ao público perto do player e diretrizes no portal (#55).
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

## Informações contextuais (#53, RF21)

`features/stream-context`. Junto do player (`LiveStage`), a página mostra:

| Informação | De onde vem |
|------------|-------------|
| Evento, lugar e horário | `GetStreamContext` → `ModuleLiveTargetDirectory` (APIs públicas de events/places), no servidor |
| Há quanto tempo está ao vivo | `liveSince` (= `signal_changed_at` enquanto o status é `live`): "Ao vivo há 12 min (desde 21:40)". O primeiro render usa a hora do servidor (sem erro de hidratação); depois atualiza a cada minuto |
| Situação atual | `live.streams.status_note` (até 80 caracteres, uma linha), editada pelo parceiro no portal ("Show começa 22h", "Casa cheia") |

- A situação e o início vêm no mesmo `GET /api/live/status` do #51 (`note`, `liveSince`): mudam na página
  sem recarregar. Encerrada → a situação não aparece mais. Também aparece na lista "Com live agora".
- **Portal:** campo "Situação atual" em cada transmissão não encerrada (`StreamNoteForm`, Server Action
  `updateStreamNoteAction`). Vazio limpa. Validação com zod (espaços e quebras de linha viram um espaço) e
  `check` no banco.
- **Quem altera:** dono ou admin (`UpdateStreamNote` + RLS). Column grants: como usuário, em `live.streams`
  só `control`, `status_note` e `status_note_updated_at` mudam.
- "Há quanto tempo" conta desde a última vez que o sinal entrou no ar; pausar e voltar não reinicia a contagem.

## Métricas da transmissão (#54, RF25)

`features/stream-metrics`. No portal (`/parceiro/live`), cada transmissão mostra:

| Métrica | De onde vem |
|---------|-------------|
| **Assistiram** (total e últimos 7 dias) | `live_view` com `entityType: "live"` e o id da transmissão: o player registra quando o vídeo começa a tocar, uma vez por aba (#50) |
| **Acessos à página** (total e últimos 7 dias) | `view` do lugar/evento: a página onde fica o player |

- `GetStreamMetrics` lê as transmissões do próprio parceiro e chama a porta `InteractionCounter`,
  implementada por `AnalyticsInteractionCounter` com a API pública `interactionTotals` do Analytics
  (uma consulta agregada pelo índice por entidade). São até seis consultas, em paralelo. A resposta
  do Analytics é validada com zod.
- **Sem dados pessoais:** o Analytics não guarda quem fez (LGPD). O portal só mostra contagens e diz isso.
- Se o Analytics falhar, o portal abre sem métricas (erro logado e reportado).
- **Pendência:** pico de espectadores simultâneos via API do provedor (Mux Data). Fica para depois da POC.

## Diretrizes de privacidade e enquadramento (#55, RNF16/RNF17)

`features/privacy`. Objetivo: minimizar a exposição de quem está no local.

- **Checklist obrigatório** no portal antes da primeira live (`PrivacyChecklist`): câmera no alto em plano
  aberto (sem rostos, mesas de perto, caixa ou banheiros), **sem áudio**, **aviso físico** no local e
  **LGPD** (quem pedir para não aparecer → ajustar o enquadramento ou pausar). Todos os itens são obrigatórios
  (zod), e o formulário envia a versão que a pessoa leu.
- **Aceite registrado** em `live.broadcaster_agreements` (`owner_id`, `guidelines_version`, `privacy_ack_at`),
  um por parceiro. RLS: só parceiro, só em nome próprio; ninguém lê o aceite de outra pessoa. Apagar a conta
  apaga o aceite. Mudou o texto de forma relevante → nova `LIVE_GUIDELINES_VERSION` → novo aceite.
- **Trava no caso de uso** (`PrivacyGate`): sem o aceite da versão vigente, `ProvisionStream` (gerar a chave) e
  `ControlStream` com "Ativar" recusam com `privacy_guidelines_required`. Vale o aceite do **dono**, mesmo quando
  um admin ativa. Pausar e encerrar continuam livres (são ações de proteção). A tela também desabilita os botões.
- **Guia de posicionamento de câmera** sempre visível no portal (`CameraGuide`), com o texto sugerido para o
  cartaz no local.
- **Público:** aviso curto perto do player (`PublicLiveNotice`): plano aberto, sem áudio, sem gravação e como
  pedir para não aparecer.
- Transmissões criadas antes do aceite continuam com o controle que tinham; "Ativar" passa a exigir o aceite.

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

## Plano do parceiro

Gerar a chave e ativar a transmissão exigem que o plano do dono libere o recurso `live` (veja [cobrança](billing.md)).
O plano padrão inicial libera, então o comportamento só muda se o time tirar a live de um plano.

## Chamadas na live — CTAs programados (#93)

Uma **chamada** (CTA) é um cartão que aparece sobre o player na hora que o parceiro definir, para levar quem
assiste a agir. O parceiro programa em `/parceiro/live/chamadas/<transmissão>` (link "Chamadas na live" em cada
transmissão do portal).

| Tipo | O que o parceiro escolhe | Para onde o toque leva |
| --- | --- | --- |
| `promocao` | uma oferta sua, valendo ou agendada | página do lugar/evento onde a oferta é resgatada |
| `missao` | uma missão sua ativa | página da missão (onde se aceita) |
| `evento` | um evento seu que não terminou | página do evento |
| `quero-ir` | nada | rota até o lugar no app de mapas |
| `link` | um endereço https | o endereço (só domínios permitidos) |

- **Tipos são estratégias** (`features/schedule-cta/cta-types.ts`, `CtaTypeHandler`): cada um diz que campo pede,
  que opções oferece e resolve o destino. Tipo novo = implementação nova na lista, sem `if` nos casos de uso. Os
  outros módulos são consultados pela porta `CtaCatalog` (`infra/cta-catalog.ts`, APIs públicas de partners,
  missions e events).
- **Agendamento** (`domain/cta.ts`): horário marcado (até 24 h); relativo ao início da live ("15 min depois de
  entrar ao vivo, por 10 min"); ou recorrente ("a cada 30 min, por 5 min", a primeira aparição um intervalo depois
  do início). Horários no fuso de Joinville. A **agenda de hoje** mostra as aparições com hora; relativas e
  recorrentes ganham hora quando a live entra no ar.
- **Prioridade** (alta, normal, baixa): se duas coincidirem, aparece a de maior prioridade.
- **Limites**: 20 chamadas por transmissão; título até 60 caracteres, texto até 140, botão até 24.
- **Plano**: recurso `cta` (porta pública do billing). Sem ele, a tela leva aos planos e o caso de uso recusa.
- **Links**: só `https` de domínios permitidos. Padrão em `DEFAULT_CTA_LINK_DOMAINS`; `LIVE_CTA_LINK_DOMAINS`
  (lista separada por vírgula) substitui a lista.
- **Banco**: `live.ctas`, com RLS — o dono lê, cria, altera e remove só os próprios; admin só lê. O público não
  lê a tabela: a chamada ativa sai pelo backend, junto do status da live.

Limitações: sem imagem na chamada; o destino é resolvido ao salvar (se a oferta mudar de lugar depois, é preciso
salvar a chamada de novo); quem perde o recurso no plano não cria novas chamadas, mas as já programadas não são
apagadas.

### A chamada no player (#179, #180)

- **Sem job**: a chamada ativa é calculada na leitura (`GetActiveCta` + `pickActiveCta`) e vai no mesmo
  `GET /api/live/status` que a página já consulta a cada 12 s (`cta` no `LiveStatusView`). Aparece e some com esse
  atraso, bem abaixo do 1 min pedido. Quando o status migrar para o Supabase Realtime, a chamada vai junto.
- **Só ao vivo**: aguardando sinal, pausada ou encerrada → `cta: null`.
- **Uma por vez**: entre as que estão na janela, vence a maior prioridade; no empate, a mais antiga.
- **O cliente também confere a janela**: o status traz `until` e o cartão some no fim, mesmo sem nova consulta.
- **Cartão** (`CtaOverlay`): abaixo do vídeo no celular e no canto de cima em telas maiores (não cobre o centro
  nem os controles). Pode ser fechado e não volta na mesma sessão (`sessionStorage`). Link externo abre em nova
  aba; "Quero ir" também registra o clique em `/api/favorites/want-to-go`, como o botão da página.
- **Falha não derruba a live**: se a leitura das chamadas falhar, o player segue sem cartão e o erro é registrado.

### Disparo manual (#181)

Na lista de chamadas, com a transmissão **ao vivo**, o botão "Soltar agora" põe a chamada no ar por 5, 10 ou 15
minutos (`TriggerCta`), sem depender do agendamento; "Tirar do ar" encerra antes. A chamada solta à mão passa na
frente das programadas (se houver duas, fica a solta por último) e chega a quem assiste pelo mesmo status da live.
Fora do ar o botão fica desabilitado e o caso de uso recusa. O disparo são duas colunas em `live.ctas`
(`triggered_at`, `triggered_until`, no máximo 60 min), alteradas só pelo dono (RLS).

### Resultado e moderação das chamadas (#182)

- **Impressões e toques**: o cartão envia `cta_impression` (uma vez por aba e por chamada) e `cta_click` para
  `POST /api/analytics/track`, com a entidade `cta` — só o quê e quando, nunca quem, e respeitando o
  consentimento de métricas (#25). O endpoint só aceita esses dois tipos para a entidade `cta` (e o banco repete
  a regra). O parceiro vê "Apareceu" e "Toques" (com a taxa) em cada chamada da lista.
- **Moderação**: em `/admin/conteudo/chamadas` (capacidade `content:edit`), o time vê as chamadas de toda a
  plataforma e **desativa** ou **reativa**. Desativada, a chamada não aparece no player nem na agenda, e o
  parceiro vê "Desativada pela moderação" sem conseguir soltá-la. No banco, um gatilho separa as colunas: só a
  moderação mexe em `disabled_at`/`disabled_by`, e só o dono altera o conteúdo.
- **Auditoria**: `live.CtaDisabledByAdmin` e `live.CtaEnabledByAdmin` entram na trilha do backoffice.

Limitações: os números aparecem na lista de chamadas, não no painel "Dados" do promotor; o parceiro não é
avisado quando a moderação desativa (vê o selo ao abrir a lista); a lista da moderação mostra as 50 mais recentes.

## Chat da live (#95)

Mensagens curtas junto do player, para quem assiste sentir o clima e conversar com o anfitrião.

### Enviar e ler (#187, #188)

- **Onde aparece**: painel "Chat" logo abaixo do player (recolhível), só com a live **ao vivo**. Pausada ou
  encerrada, o chat fecha e some. Visitante lê; para escrever, "Entre para participar".
- **Gravação sempre pelo servidor**: `POST /api/live/chat` (`SendChatMessage`). Quem envia vem da sessão. Na ordem:
  chat aberto → até 200 caracteres → links (só o anfitrião manda) → filtro de conteúdo → 1 mensagem a cada 3 s por
  pessoa. A RLS repete o essencial (chat aberto, em nome próprio, selo de anfitrião só do dono, resposta só a
  mensagem da mesma live); o cliente nunca insere direto na tabela.
- **Portas**: `ContentFilter` (hoje `WordListFilter`, lista pt-BR + `LIVE_CHAT_BLOCKED_WORDS`; amanhã moderação por
  IA), `ChatRateLimiter` (hoje Postgres; Redis se escalar, #56), `ChatAuthors` (nome, foto e nível pelas APIs
  públicas de identity e progression) e `ChatEntitlement` (recurso `chat` do plano do dono, com cache de 30 s).
- **Leitura**: `GET /api/live/chat?streamId=&version=` (`GetChatFeed`), público. Devolve as últimas 50 mensagens e
  uma `version`; se a tela já tem aquela versão, a resposta vem sem mensagens (uma consulta barata por atualização).
- **Atualização**: polling de 2,5 s, só com a aba visível, atrás do componente `LiveChat` (mesma estratégia do
  status da live; o Realtime está desligado no CI de E2E). A mensagem chega aos outros em até ~2,5 s, não em 1 s.
- **O que a tela recebe**: nome, foto, nível e selo "Anfitrião"; nunca o id nem o e-mail de quem escreveu.
- **LGPD**: na exclusão da conta as mensagens ficam sem autor ("Usuário removido"). O conteúdo das mensagens não
  vai para os logs.
