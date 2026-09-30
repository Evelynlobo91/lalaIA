# LalaIA

> **"O que eu posso fazer AGORA, em Joinville, que combina comigo?"**

Plataforma gamificada de descoberta urbana: lugares, eventos, lives do ambiente e missões
em Joinville, num único app. **Descobrir → Ver → Decidir → Viver.**

## Rodando localmente

Requer Node.js 22+.

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # lint (inclui fronteiras entre módulos) + typecheck + testes
```

## Arquitetura

Monólito modular em Next.js + TypeScript, organizado em **módulos** por capacidade de negócio
e **vertical slices** por funcionalidade, seguindo SOLID.

- [Arquitetura e convenções](docs/architecture.md)
- [ADR 0001: monólito modular](docs/adr/0001-monolito-modular.md)
- [Módulo de exemplo (template de slice)](docs/templates/module-example)

## Planejamento

Os epics e slices estão nas [issues](https://github.com/Evelynlobo91/lalaIA/issues).
A visão geral e a rastreabilidade de requisitos ficam na issue #83.
