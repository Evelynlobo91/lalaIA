# Qualidade: acessibilidade e navegadores

## Acessibilidade (#82, RNF02)

- `e2e/acessibilidade.spec.ts` roda o **axe** (WCAG 2.1 A/AA) nas telas principais, públicas, logadas e do
  portal, no celular e no desktop. O teste **falha com qualquer violação crítica ou séria**.
- O canvas do mapa (MapLibre) fica fora da varredura: é visual e sempre tem alternativa em lista.
- Na primeira varredura não havia violações críticas/sérias. As moderadas encontradas foram corrigidas:
  - home: título do card "Tem 2 horas e R$70?" pulava de h1 para h3 → `CardTitle as="h2"`;
  - telas de conta (/entrar, /cadastro): o logo ficava fora de landmark → `<header>`.
- Teste de usabilidade com pessoas: os achados devem virar issues com o rótulo `usabilidade` (não automatizável).

## Navegadores (#80, RNF12)

- Projetos do Playwright: Chromium em celular (360), tablet (768) e desktop (1280) rodam a suíte inteira;
  **Safari/WebKit (iPhone 13)** e **Firefox (desktop)** rodam os fluxos críticos (`e2e/fluxos-criticos.spec.ts`):
  busca → lugar → como chegar; agenda e detalhe de evento; entrar → favoritar → Meus favoritos → sair;
  aceitar missão; Me Surpreenda. No CI, os três navegadores são instalados no job de E2E.
- **Achado real no Safari:** o cookie de sessão era `Secure` sempre que `NODE_ENV=production`; o WebKit
  descarta cookies `Secure` em `http://localhost`, então a sessão se perdia nos testes. Agora o `Secure` é
  decidido pelo protocolo de `NEXT_PUBLIC_SITE_URL` (https → `Secure`), sem mudar nada em produção.
