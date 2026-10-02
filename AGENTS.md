<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Convenções do LalaIA

- Monólito modular com vertical slices: leia `docs/architecture.md` antes de criar código.
- Código novo vai em `src/modules/<modulo>/features/<slice>/`; nunca crie pastas globais `services/`, `controllers/` ou `repositories/`.
- De fora de um módulo, importe só o seu `index.ts`. `npm run lint` bloqueia imports internos.
- O caso de uso depende de portas (interfaces) injetadas; adaptadores de infraestrutura ficam em `infra/`.
- Entradas são validadas com zod. Cada caso de uso tem teste (Vitest) com portas mockadas.
- Antes de abrir um PR, rode `npm run check`. Use uma branch por slice (`feat/<modulo>/<slice>`) e referencie a issue.
