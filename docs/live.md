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
