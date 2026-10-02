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

## Orçamento de performance (#79, RNF03)

`npm run perf` (Lighthouse CI, `lighthouserc.cjs`) mede a home, `/lugares`, `/eventos`, `/buscar` e um lugar,
3 vezes cada, em **celular com 4G lento** (562 ms de latência, 1,6 Mbps) e CPU 4× mais lenta, contra o build
de produção. No CI roda no job de E2E, depois dos testes, e **falha se estourar**:

| Métrica (mediana) | Limite | Antes | Depois |
|---|---|---|---|
| LCP | **< 2,5 s** (erro) | ~4,1–4,3 s | 2,0–2,4 s |
| CLS | < 0,1 (erro) | 0 | 0 |
| Acessibilidade | ≥ 0,9 (erro) | 1,0 | 1,0 |
| TBT | < 300 ms (aviso) | — | 0,9–1,2 s |
| Nota de performance | ≥ 0,85 (aviso) | — | 0,72–0,77 |

O que mudou:
- **MapLibre (~1 MB) só onde há mapa:** o `MapView` importa `maplibre-gl` dinamicamente e entrega o módulo às
  camadas (`add(map, lib)`); as camadas só usam `import type`. Antes ele ia no JavaScript de todas as páginas.
- **Zod fora do navegador:** constantes usadas por componentes cliente (`roundCoordinate`, `LIVE_NOW_POLL_MS`)
  saíram dos arquivos de schema.
- **Home por streaming:** o feed de recomendações (a parte lenta) fica em `Suspense`; o topo sai na hora.
- **CSS embutido no HTML** (`experimental.inlineCss`): sem a ida e volta extra do `<link>` que bloqueia a
  renderização. JavaScript da página: ~695 KB → ~420 KB.

**Por que estrangulamento aplicado (`devtools`) e não o simulado:** rodando contra `localhost`, o modo
simulado (Lantern) atribui ao LCP todos os recursos baixados antes dele e superestima em 1–2 s (LCP observado
~0,3 s × estimado ~3,5 s nas mesmas páginas). O aplicado mede a pintura real sob a rede lenta.

**Pendente:** o TBT continua alto com a CPU 4× mais lenta (hidratação + Sentry no cliente). Próximos passos:
carregar o Sentry do navegador sob demanda e reduzir componentes cliente nas listas.
