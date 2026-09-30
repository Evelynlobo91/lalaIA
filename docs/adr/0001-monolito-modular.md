# ADR 0001 — Monólito modular com vertical slices

- **Status:** aceito
- **Data:** 2026-09-29
- **Requisitos:** RNF09 (evoluir módulos sem comprometer o todo)

## Contexto

O LalaIA tem capacidades bem distintas: lugares, eventos, live, missões, progressão,
recomendação, analytics. O RNF09 exige que cada uma evolua sem quebrar as outras.
Somos um time pequeno construindo uma POC para um hackathon, com deploy na Vercel + Supabase.

## Decisão

1. **Monólito modular, não microsserviços.** Um único app Next.js com fronteiras
   fortes no código. Microsserviços só adicionariam infraestrutura para depurar.
2. **Um módulo por capacidade de negócio** em `src/modules/<modulo>/`, com schema
   Postgres próprio (`places`, `events`, `live`, ...).
3. **Cada funcionalidade é um vertical slice** em `features/<slice>/`, contendo
   caso de uso, validação, adaptador HTTP, UI e testes. Não existem pastas globais
   `controllers/`, `services/` ou `repositories/`.
4. **Módulos só se comunicam** pela API pública (`index.ts`) de outro módulo ou por
   eventos de domínio (event bus interno). Nunca por import de arquivo interno
   nem por join entre schemas de módulos diferentes.
5. **SOLID dentro do slice:** o caso de uso depende de portas (interfaces) injetadas;
   adaptadores de infraestrutura (Supabase, Mux, Claude API) as implementam.
6. **As fronteiras são verificadas por lint** (`eslint-plugin-boundaries`); o CI falha
   quando alguma é violada.

## Consequências

- ✅ Um slice pode ser criado, alterado ou removido sem tocar em outros módulos.
- ✅ Live ou Recomendação podem ser extraídas para um serviço próprio no futuro,
  trocando o `index.ts` por um client HTTP sem mudar quem as consome.
- ✅ Testes de caso de uso rodam sem banco (portas mockadas).
- ⚠️ Aceitamos alguma duplicação de tipos entre módulos em troca de baixo acoplamento.
- ⚠️ Consultas que cruzam módulos passam pela API pública (ou por um read model
  próprio), nunca por join direto.
