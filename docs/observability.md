# Observabilidade (RNF10)

## Logs estruturados

Todo log é **uma linha JSON** com `time`, `level`, `msg`, `service`, `requestId` (quando dentro
de uma requisição) e os campos passados.

```ts
import { logger } from "@/shared/observability";

const log = logger().child({ module: "places" });
log.info("lugares importados", { total: 1234 });
log.error("falha ao importar", { err: error });
```

- **Níveis:** `debug` < `info` < `warn` < `error`, definidos por `LOG_LEVEL` (padrão: `debug` em dev, `info` em produção).
- **Dados sensíveis são mascarados automaticamente** (LGPD): chaves com senha, token, secret,
  authorization, cookie, api key, email, cpf, telefone e stream key saem como `[redacted]`.
  Mesmo assim, **não logue dados pessoais**; logue IDs.
- Erros passados como campo (`{ err }`) viram `{ name, message, stack, cause }`.

## requestId

Toda rota montada com `jsonRoute`/`queryRoute` (via `observed`):
- gera um `requestId` (ou reaproveita um `x-request-id` válido vindo do proxy);
- deixa o id disponível para qualquer log do caso de uso, sem precisar repassá-lo (AsyncLocalStorage);
- devolve o id no header `x-request-id`;
- registra um log de acesso: método, rota, status e duração.

Em erro 500, o corpo da resposta traz o `requestId` para o suporte localizar o caso.

## Sentry

| Onde | Arquivo |
|------|---------|
| Servidor (Node) | `src/bootstrap/sentry.server.ts` (carregado por `src/instrumentation.ts`) |
| Edge | `src/bootstrap/sentry.edge.ts` |
| Navegador | `src/instrumentation-client.ts` |
| Erro no layout raiz | `src/app/global-error.tsx` |
| Opções comuns + limpeza de PII | `src/shared/observability/sentry-options.ts` |

- **Desligado sem `NEXT_PUBLIC_SENTRY_DSN`**: o desenvolvimento local não depende de conta.
- `sendDefaultPii: false`; o `beforeSend` remove cookies, corpo da requisição, headers de
  autenticação e mantém só o `id` do usuário.
- Sem Session Replay: gravaria telas com dados pessoais.
- São reportados só os erros **inesperados** (500 e falhas em assinantes de eventos). Erros de domínio
  (400–422) são comportamento normal e não poluem o Sentry.
- Source maps são enviados só quando `SENTRY_AUTH_TOKEN` existe (CI/produção).

### Validar com uma conta real
1. Crie um projeto Next.js no Sentry e copie o DSN para `NEXT_PUBLIC_SENTRY_DSN` no `.env.local`.
2. Reinicie o `npm run dev` e provoque um erro numa rota: ele aparece no Sentry com a tag
   `request_id` igual ao header `x-request-id` da resposta.

## Disponibilidade: health check e monitor (#81)

- **`GET /api/health`** (e `HEAD`): verifica as dependências em paralelo, cada uma com limite de 3 s.
  - `banco` (**crítica**: `select 1`) e `autenticacao` (Supabase Auth `/auth/v1/health`, não crítica).
  - Resposta: `{ status: ok | degraded | down, checkedAt, version, checks: [{ name, critical, status, latencyMs }] }`.
  - **200** para `ok`/`degraded` (o app atende), **503** para `down`. `Cache-Control: no-store`.
  - O motivo de uma falha vai só para o log estruturado, nunca para a resposta (sem vazar host, usuário ou erro do banco).
  - Nova dependência = nova classe `HealthCheck` em `src/modules/platform/infra/health-checks.ts` + uma linha na composição.
- **Página `/status`**: situação geral e de cada serviço, com ícone e texto (fora dos buscadores).
- **Monitor externo** (`.github/workflows/uptime.yml`): a cada 10 min consulta `vars.HEALTHCHECK_URL` (configure
  a variável do repositório com a URL de produção). Sem 200 em duas tentativas → abre (ou comenta) uma issue
  com o rótulo **`incidente`**, e o GitHub notifica quem acompanha o repositório; quando volta, comenta e fecha.
  Sem a variável, o workflow não roda. Se quiser alertas por telefone, aponte também um monitor como
  UptimeRobot/Better Stack para o mesmo endpoint.

