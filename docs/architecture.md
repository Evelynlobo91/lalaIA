# Arquitetura do LalaIA

> Decisão registrada no [ADR 0001](adr/0001-monolito-modular.md).

## Estrutura

```
src/
├─ app/                          # rotas Next.js (App Router), apenas composição
├─ bootstrap/                    # composição no boot do servidor (assinaturas de eventos)
├─ instrumentation.ts            # hook do Next que chama o bootstrap
├─ shared/                       # kernel genérico: Result, erros, event bus, UI base
│                                #   (não conhece nenhum módulo)
└─ modules/
   └─ <modulo>/                  # ex.: places, events, live, missions
      ├─ index.ts                # API PÚBLICA: único arquivo importável de fora
      ├─ domain/                 # entidades, value objects, regras puras, portas
      ├─ infra/                  # adaptadores (Supabase, Mux, Claude...) que implementam as portas
      └─ features/
         └─ <slice>/             # uma funcionalidade ponta a ponta
            ├─ <slice>.use-case.ts
            ├─ <slice>.schema.ts
            ├─ <slice>.route.ts
            ├─ ui/
            └─ <slice>.test.ts
```

Há um módulo completo de exemplo em [`docs/templates/module-example`](templates/module-example).

## Regras de dependência (verificadas pelo ESLint)

| De \ Para      | `app/` | `shared/` | mesmo módulo | `index.ts` de outro módulo | interno de outro módulo |
|----------------|:------:|:---------:|:------------:|:--------------------------:|:-----------------------:|
| `app/`         |   ✅   |    ✅     |      —       |             ✅             |           ❌            |
| `modules/<x>/` |   ❌   |    ✅     |      ✅      |             ✅             |           ❌            |
| `shared/`      |   ❌   |    ✅     |      —       |             ❌             |           ❌            |

Para reagir a algo que acontece em outro módulo, **assine um evento de domínio**
(ex.: Progressão escuta `MissionStepCompleted`) em vez de esperar ser chamado diretamente.

## Shared kernel (`src/shared/`)

| Peça | Arquivo | Para que serve |
|------|---------|----------------|
| `Result`, `ok`, `err` | `shared/kernel/result.ts` | Casos de uso retornam falhas esperadas como valor, não como exceção |
| Erros de domínio | `shared/kernel/errors.ts` | `ValidationError` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, `BusinessRuleError` 422 |
| `jsonRoute` / `queryRoute` | `shared/http/json-route.ts` | Valida a entrada com zod, chama o caso de uso e converte `Result` → `Response`. Exceção inesperada vira 500 genérico, sem vazar detalhes |
| Event bus | `shared/events/` | `DomainEventPublisher` (casos de uso) e `DomainEventSubscriber` (composição); `domainEvents()` é a instância do processo |
| `lazy` | `shared/kernel/lazy.ts` | Cria dependências no primeiro uso, na composição do módulo |
| `sql()` | `shared/db/sql.ts` | Conexão Postgres (somente servidor, somente em `infra/`) |
| `logger()`, `errorReporter()` | `shared/observability/` | Logs JSON com requestId e redação de PII; envio de erros ao Sentry. Veja [observabilidade](observability.md) |

### Interface (design system)

- **Tokens de cor** em `src/app/globals.css`, com nomes semânticos (`bg`, `fg`, `surface`, `muted`,
  `brand`, `accent`, `success`, `warning`, `danger`, `live`), tema claro e escuro. O teste
  `src/shared/ui/tokens.test.ts` garante contraste **WCAG AA** em todos os pares cor/texto.
- **Componentes base** em `src/shared/ui/`: `Button`/`ButtonLink`, `Card`, `Badge`/`LiveBadge`,
  `EmptyState` e `Sheet` (painel modal com `<dialog>` nativo). Use `cn()` para combinar classes:
  conflitos do Tailwind são resolvidos com a última classe vencendo.
- **Shell do app** em `src/app/(app)/`: barra inferior no celular e barra lateral a partir do tablet.
  Destinos em `_components/nav-items.ts`.
- **Catálogo** em http://localhost:3000/design (somente em desenvolvimento).
- **E2E** (`npm run test:e2e`, Playwright) roda contra o build de produção em 360, 768 e 1280 px.

### Eventos de domínio

1. Declare os eventos do módulo em `domain/events.ts` (nome `<modulo>.<Evento>`):
   ```ts
   declare module "@/shared/events/domain-event" {
     interface DomainEventMap {
       "missions.StepCompleted": { userId: string; missionId: string; stepId: string };
     }
   }
   export {};
   ```
2. O caso de uso recebe um `DomainEventPublisher` e chama `publish(...)` **depois** de persistir.
3. Quem reage exporta `subscriptions: ModuleSubscriptions` no `index.ts` e é registrado em
   `src/bootstrap/register-subscriptions.ts` (executado no boot por `src/instrumentation.ts`).
4. Handlers são isolados (a falha de um não afeta os outros nem quem publicou) e devem ser
   **idempotentes**, usando `event.id` para deduplicar.

> O bus é in-process: eventos não sobrevivem a um restart. Para efeitos críticos (XP, recompensas),
> o handler grava no banco de forma idempotente. Se precisarmos de garantia de entrega, a evolução
> natural é um outbox (`platform.outbox`) sem mudar as portas.

## SOLID na prática

| Princípio | Como aplicamos |
|-----------|----------------|
| **S**ingle responsibility | Um caso de uso por slice; validação, HTTP e UI em arquivos separados. |
| **O**pen/closed | Variações entram como novas estratégias (`ScoreSignal`, `StepValidator`, `MapLayerProvider`), não como `if`s. |
| **L**iskov | Toda implementação de uma porta respeita o contrato; os testes do caso de uso passam com qualquer implementação. |
| **I**nterface segregation | Portas pequenas (`PlaceReader`, `PlaceWriter`) em vez de um `PlaceService` genérico. |
| **D**ependency inversion | O caso de uso recebe portas no construtor; a composição acontece no `index.ts` do módulo. |

## Criando um novo slice

1. Crie `src/modules/<modulo>/features/<slice>/` (copie o exemplo).
2. Escreva primeiro o caso de uso, com teste, dependendo só de portas.
3. Se precisar de um adaptador novo, implemente-o em `infra/`.
4. Exponha no `index.ts` só o que outros módulos ou o `app/` precisam.
5. Monte a rota/página em `src/app/` importando do `index.ts`.
6. Use uma branch e um PR por slice (`feat/<modulo>/<slice>`), referenciando a issue.

## Comandos

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Sobe o app em http://localhost:3000 |
| `npm run check` | Roda lint (inclui fronteiras), typecheck e testes |
| `npm test` | Roda os testes (Vitest) |

## Identidade e sessão

- Autenticação pelo **Supabase Auth** (senha com hash no Supabase: RNF04). O cliente por
  requisição fica em `modules/identity/infra/supabase-server-client.ts`.
- **Cadastro** (`/cadastro`): Server Action + `useActionState`, via o adaptador `formAction`
  (`shared/http/form-action.ts`). Os tipos seguros para o navegador ficam em `shared/http/form-state.ts`.
- **Aceite dos termos** é gravado por trigger no banco, na mesma transação do signup, e a conta é
  recusada sem aceite, mesmo se alguém chamar a API do Supabase direto.
- **Anti-enumeração:** e-mail já cadastrado, ou pendente de confirmação, recebe a mesma resposta
  de um cadastro novo.
- **Confirmação de e-mail** por `token_hash` (`/auth/confirm`), que funciona mesmo abrindo o link
  em outro navegador. Redirecionamentos passam por `safeRedirectPath` (sem open redirect).
- **Login/logout** (`/entrar`): Server Actions; erro genérico "E-mail ou senha incorretos" (não
  revela se o e-mail existe). Logout é POST (CSRF protegido pelo Next).
- **Sessão em cookie `httpOnly` + `SameSite=Lax`**: o token não é acessível ao JavaScript da página.
  `src/proxy.ts` renova a sessão a cada requisição com `getClaims()`, que valida o JWT (nunca use
  `getSession()` no servidor). O proxy importa `@/modules/identity/proxy`, uma entrada enxuta do módulo.
- **Proteger uma página:** `const user = await requireUser("/rota")`. Sem sessão, o usuário vai para
  `/entrar?next=/rota` e volta depois do login. Para leitura opcional, use `getCurrentUser()`
  (memoizado por requisição).
- **Server Actions autenticadas:** envolva o handler com `withUser((input, user) => ...)`. O id do
  usuário vem sempre da sessão, nunca do formulário (anti-IDOR).
- **Perfil e preferências** (`/perfil/editar`): nome, foto e preferências (categorias do catálogo
  `shared/catalog/categories.ts`, orçamento, distância, com quem sai). Outros módulos leem com
  `userPreferences().preferencesOf(userId)`, que sempre devolve preferências completas.
- **Foto de perfil:** bucket `avatars` do Supabase Storage (público para leitura, até 2 MB, JPG/PNG/WebP).
  O formato é validado pelos bytes reais do arquivo. As políticas do Storage só deixam cada usuário
  gravar em `avatars/<seu id>/`, e a foto anterior é apagada ao trocar.
- **Papéis (RNF05):** todo usuário é "comum"; `partner` e `admin` ficam em `identity.user_roles`
  e chegam em `user.roles`, lidos do banco a cada requisição (revogar vale na hora).
  - Páginas: `requireRole("admin", "/admin")`. Sem sessão leva ao login; sem o papel devolve **404**,
    o que não revela que a área existe.
  - Actions: `withRole("partner", (input, user) => ...)` devolve `ForbiddenError` sem o papel.
  - Casos de uso sensíveis conferem o papel **de novo** (ex.: `ListUsersForModeration`), sem confiar
    que quem chama já checou.
  - No banco, RLS com `asUser` + `authz.has_role()` (veja [banco de dados](database.md)).
- Template do e-mail em `supabase/templates/confirmation.html`. Localmente, os e-mails chegam no
  Mailpit (http://127.0.0.1:54324).
