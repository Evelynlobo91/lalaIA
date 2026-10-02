# LalaIA

> **"O que eu posso fazer AGORA, em Joinville, que combina comigo?"**

Plataforma gamificada de descoberta urbana: lugares, eventos, lives do ambiente e missões
em Joinville, num único app. **Descobrir → Ver → Decidir → Viver.**

## Rodando localmente

Requer Node.js 22+ e Docker Desktop aberto.

```bash
npm install
npm run db:start                 # sobe o Supabase local (1ª vez baixa as imagens)
cp .env.example .env.local       # preencha a PUBLISHABLE_KEY com a do `npm run db:status`
npm run dev                      # http://localhost:3000
```

| Serviço | URL |
|---------|-----|
| App | http://localhost:3000 |
| Supabase Studio (tabelas, SQL, auth) | http://127.0.0.1:54323 |
| Mailpit (e-mails de cadastro/login) | http://127.0.0.1:54324 |
| Catálogo de componentes (dev) | http://localhost:3000/design |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

```bash
npm run check      # lint (inclui fronteiras entre módulos) + typecheck + testes unitários
npm run test:int   # testes de integração (precisa do db:start)
npm run db:reset   # recria o banco do zero (migrations + lugares de Joinville)
npm run places:seed  # (re)importa os lugares de Joinville do snapshot do OpenStreetMap
npm run test:e2e   # testes E2E (Playwright) no build de produção, em 360/768/1280 px
npm run role -- grant admin voce@exemplo.com   # concede papel (partner/admin) a uma conta
```

Veja também [convenções do banco](docs/database.md), [lugares do OpenStreetMap](docs/places-data.md), [parceiros](docs/partners.md), [eventos](docs/events.md), [favoritos](docs/favorites.md), [missões](docs/missions.md), [analytics](docs/analytics.md), [recomendação](docs/recommendation.md), [live](docs/live.md), [privacidade e LGPD](docs/privacy.md), [progressão](docs/progression.md), [qualidade](docs/quality.md), [observabilidade](docs/observability.md) e [CI/CD e deploy](docs/deploy.md).

## Arquitetura

Monólito modular em Next.js + TypeScript, organizado em **módulos** por capacidade de negócio
e **vertical slices** por funcionalidade, seguindo SOLID.

- [Arquitetura e convenções](docs/architecture.md)
- [ADR 0001: monólito modular](docs/adr/0001-monolito-modular.md)
- [Módulo de exemplo (template de slice)](docs/templates/module-example)

## Planejamento

Os epics e slices estão nas [issues](https://github.com/Evelynlobo91/lalaIA/issues).
A visão geral e a rastreabilidade de requisitos ficam na issue #83.
