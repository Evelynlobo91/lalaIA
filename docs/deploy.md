# CI/CD e deploy

## CI (GitHub Actions)

`.github/workflows/ci.yml` roda em **todo PR** (inclusive PRs empilhados) e em push na `main`:

| Job | O que valida |
|-----|--------------|
| `check` | `npm run lint` (inclui fronteiras entre módulos), `npm run typecheck`, `npm test` |
| `integration` | Sobe o Postgres do Supabase, aplica **todas as migrations do zero** e roda `npm run test:int` |
| `build` | `npm run build` de produção |

O workflow tem permissão só de leitura e cancela execuções antigas do mesmo PR.
Dependências (npm e actions) são atualizadas semanalmente pelo Dependabot.

### Bloquear merge com CI vermelho
Em **Settings → Branches → Add branch ruleset** para a `main`:
- *Require a pull request before merging*
- *Require status checks to pass*: `Lint, typecheck e testes unitários`,
  `Testes de integração (Postgres + PostGIS)` e `Build de produção`

## Deploy (Vercel)

A integração da Vercel com o GitHub gera um **preview por PR** e publica a `main` em produção.

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório `Evelynlobo91/lalaIA`
   (framework detectado: Next.js; não altere build/output).
2. Em **Settings → Environment Variables**, cadastre as variáveis do `.env.example`
   para *Production* e *Preview*. O `DATABASE_URL` e as chaves do Supabase apontam para o projeto
   Supabase na nuvem (o banco local não é acessível pela Vercel).
   - **Live:** em produção, cadastre `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` e `MUX_WEBHOOK_SECRET` e aponte o
     webhook do Mux para `https://<domínio>/api/live/webhooks` ([passo a passo](live.md#configurar-o-mux)).
     Em previews sem Mux, defina só `LIVE_FAKE_WEBHOOK_SECRET` (provedor simulado). Nenhum dos segredos tem
     valor padrão: sem eles, as telas de Live falham com uma mensagem clara.
3. Pronto: cada PR ganha um comentário com a URL de preview, e merge na `main` publica em produção.

> Segredos (`DATABASE_URL`, `SENTRY_AUTH_TOKEN`, chaves `secret`/`service_role`) só existem nas
> variáveis da Vercel/GitHub, nunca no repositório.
