# Arquitetura do LalaIA

> Decisão registrada no [ADR 0001](adr/0001-monolito-modular.md).

## Estrutura

```
src/
├─ app/                          # rotas Next.js (App Router), apenas composição
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
