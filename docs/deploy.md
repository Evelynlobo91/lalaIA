# CI/CD e deploy

## CI (GitHub Actions)

`.github/workflows/ci.yml` roda em **todo PR** (inclusive PRs empilhados) e em push na `main`:

| Job | O que valida |
|-----|--------------|
| `Lint, typecheck e testes unitários` | `npm run lint` (inclui fronteiras entre módulos), `npm run typecheck`, `npm test` |
| `Testes de integração (Postgres + PostGIS)` | Sobe o Postgres do Supabase, aplica **todas as migrations do zero** e roda `npm run test:int` |
| `Build de produção` | `npm run build` |
| `Testes E2E (celular, tablet, desktop)` | Playwright no build de produção, com o Supabase local |
| `Agente de borrão de rostos (lógica)` | Testes do agente em `tools/face-blur-agent` |

O workflow tem permissão só de leitura e cancela execuções antigas do mesmo PR.
Dependências (npm e actions) são atualizadas semanalmente pelo Dependabot.

A `main` é protegida por ruleset: PR obrigatório, aprovação do code owner e os checks acima verdes.

## Implantação: Vercel + Supabase cloud

Decisões do piloto (2026-10): app na **Vercel**, banco/auth/storage no **Supabase cloud**, vídeo no **Mux**,
mapa no **MapTiler**, roteiro do ME SURPREENDA pelo **Claude**, pagamento **simulado** (sem gateway real) e
rotinas pelo **Vercel Cron**.

> Segredos só existem nas variáveis de ambiente da Vercel (e do GitHub, para o CI). Nunca no repositório,
> em issue, PR ou conversa.

### Ordem dos passos

#### 1. Supabase cloud

1. Crie o projeto em [supabase.com](https://supabase.com) (região `sa-east-1`, São Paulo). Guarde a senha do banco.
2. Aplique as migrations, a partir da sua máquina:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push
   ```
   As migrations criam os schemas, as políticas de RLS, o bucket de avatares e os agendamentos do `pg_cron`
   (métricas diárias, amostra de audiência da live a cada minuto, retenção do chat). O `pg_cron` precisa estar
   habilitado no projeto (Database → Extensions); as migrations fazem `create extension if not exists`.
3. **Authentication → URL Configuration**: *Site URL* = `https://<domínio>`; em *Redirect URLs*, acrescente
   `https://<domínio>/auth/confirm` (a rota que confirma o e-mail; e o padrão dos previews da Vercel, se for usar
   login neles).
4. **Authentication → Providers → Email**: confirmação de e-mail **ligada** (o app conta com isso: equipe do
   parceiro e convites usam o e-mail confirmado).
5. Anote, em **Project Settings**:
   - *API*: a URL do projeto e a chave **publishable**;
   - *Database → Connection string*: a do **pooler em modo transaction** (porta 6543). O app já usa
     `prepare: false`, exigido por esse modo. Em serverless, a conexão direta (5432) esgota conexões.

#### 2. Contas externas

| Serviço | O que criar | Variáveis |
|---|---|---|
| **Mux** | Environment de produção, token *Mux Video: Read + Write* e webhook (passo 5) | `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET` |
| **MapTiler** | Conta e chave; restrinja a chave ao domínio do app | `NEXT_PUBLIC_MAP_STYLE_URL` |
| **Anthropic** | Chave em console.anthropic.com → API Keys, com **limite de gasto mensal** | `ANTHROPIC_API_KEY` |

- MapTiler: `NEXT_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/streets-v2/style.json?key=<chave>`. Essa
  chave vai para o navegador (é pública por natureza): por isso a restrição por domínio no painel do MapTiler.
- Mux: ligue também o **alerta de cobrança** no painel dele. Os alertas do app são uma estimativa pela presença.
- Passo a passo do Mux: [live.md](live.md#configurar-o-mux).

#### 3. Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe `Evelynlobo91/lalaIA` (framework detectado: Next.js;
   não altere build/output).
2. Em **Settings → Environment Variables**, cadastre a tabela abaixo para *Production*.
3. Deploy. A integração com o GitHub gera um **preview por PR** e publica a `main` em produção.

#### 4. Variáveis de ambiente (Production)

Gere cada segredo com `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`: um valor
diferente para cada variável e para cada ambiente.

| Variável | Valor no piloto | Para que serve |
|---|---|---|
| `DATABASE_URL` | pooler do Supabase (transaction, 6543) | Banco (somente no servidor) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto | Auth e Storage |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publishable | Auth no navegador |
| `NEXT_PUBLIC_SITE_URL` | `https://<domínio>` | Links dos e-mails |
| `NEXT_PUBLIC_APP_ENV` | `production` | Rótulo do ambiente nos logs e no Sentry |
| `LOG_LEVEL` | `info` | Nível do log |
| `MISSIONS_QR_SECRET` | segredo gerado | Assina os QR codes das missões. **Obrigatório** |
| `CRON_SECRET` | segredo gerado | Autentica o Vercel Cron nas rotas agendadas. Sem ele, elas respondem 503 |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET` | do Mux | Live com vídeo real |
| `LIVE_MAX_CONCURRENT_VIEWERS` | `200` | Alerta de espectadores simultâneos (o teste de carga aguentou 200 com folga) |
| `LIVE_MONTHLY_VIEWER_MINUTES_BUDGET` | `50000` | Alerta do orçamento mensal de minutos de vídeo entregues |
| `NEXT_PUBLIC_MAP_STYLE_URL` | estilo do MapTiler | Mapa em produção (os tiles públicos do OSM não podem ser usados com tráfego real) |
| `ANTHROPIC_API_KEY` | chave do Claude | Roteiro do ME SURPREENDA. Sem ela (ou se a chamada falhar), sai do motor local |
| `BILLING_PROVIDER` | vazio | Pagamento simulado (único implementado) |
| `BILLING_FAKE_WEBHOOK_SECRET` | **vazio** | Vazio = simulador de pagamento **desligado**; o time confirma os pagamentos pelo painel financeiro |
| `BILLING_GRACE_DAYS` | vazio (5) | Carência entre o vencimento e a suspensão |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | opcional | Monitoramento de erros. Sem DSN, os alertas críticos de consumo ficam só no log |

Opcionais, com padrão no código: `SURPRISE_MODEL`, `RECOMMENDATION_WEIGHTS`, `LIVE_CTA_LINK_DOMAINS`,
`LIVE_CHAT_BLOCKED_WORDS`. `LIVE_FAKE_WEBHOOK_SECRET` só é usado **sem** o Mux (previews e desenvolvimento).

Em *Preview*, se quiser previews funcionais: as mesmas variáveis apontando para um **segundo projeto Supabase**
(nunca o de produção), sem as do Mux e com `LIVE_FAKE_WEBHOOK_SECRET`.

#### 5. Depois do primeiro deploy

1. **Webhook do Mux**: Settings → Webhooks → `https://<domínio>/api/live/webhooks`; copie o *Signing Secret* para
   `MUX_WEBHOOK_SECRET` e faça um novo deploy.
2. **Lugares**: carregue a base de Joinville com `DATABASE_URL=<produção> npm run places:import` (dados do
   OpenStreetMap; veja [places-data.md](places-data.md)).
3. **Primeiro admin**: crie a sua conta pelo app, confirme o e-mail e rode
   `DATABASE_URL=<produção> npm run role -- grant admin voce@exemplo.com`. Os demais papéis internos saem do
   backoffice (Usuários).
4. **Confira**: `/status`, login, `/admin`, o mapa com o estilo do MapTiler, e uma live de teste pelo OBS
   (portal → Live → gerar a chave) até aparecer "Ao vivo" na página do lugar.

### Rotinas agendadas (Vercel Cron)

`vercel.json` agenda duas rotas. O Vercel Cron chama com **GET** e envia `Authorization: Bearer <CRON_SECRET>`
sozinho quando a variável existe no projeto; as rotas também aceitam POST (outro agendador).

| Rota | Quando | O que faz |
|---|---|---|
| `/api/billing/cycle` | todo dia, 09:00 UTC (06:00 em Joinville) | Emite as faturas do próximo ciclo, marca as vencidas e suspende quem passou da carência |
| `/api/live/scale/check` | a cada 5 minutos | Compara a audiência com os limites; alerta vai para o log e, se crítico, para o Sentry |

- **A cadência de 5 minutos exige o plano Pro da Vercel.** No plano Hobby o cron roda no máximo uma vez por dia
  e o deploy é **recusado** com este `vercel.json`: troque a segunda linha para `"0 9 * * *"` (o alerta de
  orçamento mensal continua útil; o de simultâneos deixa de ser).
- O que roda **dentro do banco** (pg_cron) não depende da Vercel: métricas diárias, amostra de audiência e
  retenção do chat.

### Pagamento no piloto

Sem gateway real, ninguém paga de verdade. O plano pago só passa a valer quando o pagamento é confirmado, e há
dois jeitos de confirmar:

- **Pelo time (recomendado no piloto):** em `/admin/financeiro` → Faturas → "Confirmar pagamento" (capacidade
  `billing:write`; fica na auditoria). O parceiro pede o Pro em Assinatura, a fatura fica em aberto e o time
  confirma só para quem deve ter o plano. Veja [billing.md](billing.md#confirmação-manual-de-pagamento) (PR #203).
- **Pelo simulador:** com `BILLING_FAKE_WEBHOOK_SECRET` definido, o botão "Simular pagamento" aparece para o dono
  da cobrança, e **qualquer parceiro ativa o Pro de graça**. Por isso a variável fica **vazia** em produção.

Com os planos como estão, o Básico (gratuito) inclui live, missões e ofertas; o Pro (R$ 149) acrescenta destaque,
chamadas e chat. Quando houver gateway real, entra uma implementação nova de `BillingGateway`.

### O que este guia não cobre

- Domínio próprio e DNS (Vercel → Settings → Domains).
- Envio de e-mail em volume: o SMTP embutido do Supabase tem limite baixo; para o piloto aberto, configure um
  SMTP próprio em Authentication → SMTP.
- Backups além dos automáticos do plano do Supabase.
- Documentos jurídicos da live (LIA, RIPD, contrato com o parceiro), pendentes no #97.
