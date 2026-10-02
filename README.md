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
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

```bash
npm run check      # lint (inclui fronteiras entre módulos) + typecheck + testes unitários
npm run test:int   # testes de integração (precisa do db:start)
npm run db:reset   # recria o banco do zero a partir das migrations
```

Veja também [convenções do banco](docs/database.md), [observabilidade](docs/observability.md) e [CI/CD e deploy](docs/deploy.md).

## Arquitetura

Monólito modular em Next.js + TypeScript, organizado em **módulos** por capacidade de negócio
e **vertical slices** por funcionalidade, seguindo SOLID.

- [Arquitetura e convenções](docs/architecture.md)
- [ADR 0001: monólito modular](docs/adr/0001-monolito-modular.md)
- [Módulo de exemplo (template de slice)](docs/templates/module-example)

## Planejamento

Os epics e slices estão nas [issues](https://github.com/Evelynlobo91/lalaIA/issues).
A visão geral e a rastreabilidade de requisitos ficam na issue #83.
