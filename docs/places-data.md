# Lugares de Joinville (OpenStreetMap)

O "Onde ir" nasce populado com lugares reais de Joinville importados do
[OpenStreetMap](https://www.openstreetmap.org). Uma plataforma de descoberta sem dados morre no
primeiro acesso.

## Comandos

| Comando | O que faz |
|---------|-----------|
| `npm run places:seed` | Importa do **snapshot salvo** em `supabase/seed-data/osm-joinville.json` (rápido, sem rede, igual para todo o time) |
| `npm run places:import` | Busca **ao vivo** na Overpass API (com novas tentativas e servidores espelho) |
| `npm run places:import -- --save` | Busca ao vivo e **atualiza o snapshot** (faça commit do arquivo depois) |
| `npm run db:reset` | Recria o banco e já roda o `places:seed` |

A importação é **idempotente**: a chave é a origem no OSM (ex.: `node/1694859282`). Rodar de novo
não duplica nada e só atualiza lugares que mudaram. **Lugares editados por parceiros**
(`edited_by_partner_at`) nunca são sobrescritos pela reimportação.

## Como funciona

1. A consulta Overpass busca, dentro do município de Joinville/SC, lugares com nome das tags de
   alimentação, bares, cultura, lazer, esportes, compras e patrimônio histórico. O município é
   identificado pelo Wikidata `Q156819`, porque o nome sozinho também casa com Joinville, na França.
2. `placeFromOsm` (função pura, testada) converte cada elemento:
   - **categoria** pela tabela `osm-category-rules.ts` (a primeira regra que casar vence);
   - **endereço**, telefone, horário de funcionamento (formato OSM) e coordenada (centro, para áreas);
   - **site** só se for `http(s)` (dado externo nunca vira link `javascript:`). O banco também valida.
3. Descarta e conta o que não tem nome, categoria conhecida ou coordenada dentro de Joinville.

### Categorias

| Tags do OSM | Categoria |
|-------------|-----------|
| `amenity=restaurant/fast_food/food_court` | Restaurantes |
| `amenity=bar/pub/biergarten` | Bares |
| `amenity=cafe/ice_cream`, `shop=bakery/confectionery` | Cafés e docerias |
| `amenity=nightclub` | Festas e baladas |
| `amenity=marketplace` | Feiras e mercados |
| `amenity=theatre/cinema` | Teatro e dança |
| `amenity=music_venue/events_venue` | Shows e música |
| `amenity=arts_centre/library`, `tourism=museum` | Museus e cultura |
| `tourism=gallery` | Exposições |
| `tourism=zoo/theme_park`, `leisure=playground` | Para crianças |
| `leisure=stadium/sports_centre` | Esportes |
| `leisure=park/garden/nature_reserve/water_park`, `tourism=viewpoint` | Parques e ar livre |
| `shop=mall` | Compras |
| `tourism=attraction/artwork`, `historic=*` | Passeios e turismo |

Para mapear uma nova tag, adicione uma linha em `src/modules/places/domain/osm/osm-category-rules.ts`.

## Listagem e "aberto agora"

- `/lugares` e `GET /api/places?cursor=&limit=` (padrão 20, máx. 50) listam em ordem alfabética
  em português (collation ICU `places.pt_br`), com **paginação por cursor** (nome + id) sobre o
  índice `places_name_id_idx`. Medido: p95 de 18ms na API e 29ms na página.
- O cursor é opaco (base64url) e validado na volta: cursor adulterado → 400.
- **"Aberto agora"** vem de `isOpenAt` (`src/modules/places/domain/opening-hours.ts`), que interpreta
  o formato de horário do OSM no fuso de Joinville. Entende dias (`Mo-Fr`, `Sa,Su`, `Sa-Mo`), vários
  intervalos, faixas que passam da meia-noite, `24/7`, `off` e textos em português ("de 06:30 às 20:00").
  Feriados (`PH`) são ignorados. Quando não reconhece o formato, devolve `null` e a tela **não mostra**
  nada, em vez de arriscar um "aberto" errado. Hoje reconhece 54 de 56 horários reais de Joinville.

## Página do lugar

- `/lugares/[id]` mostra só os campos existentes: endereço, telefones (um link `tel:` por número),
  site (`rel="noopener noreferrer nofollow"`) e horário da semana em português ("Seg 11:00–14:30").
  Horário não reconhecido aparece como veio da fonte, sem "aberto agora".
- **Como chegar:** URL universal do Google Maps (`/maps/dir/?api=1&destination=lat,lon`), que abre o
  app de mapas do celular. Sem chave de API e sem custo. "Ver no mapa" abre o OpenStreetMap.
- **Compartilhamento:** metadados Open Graph/Twitter com URL absoluta (`metadataBase` =
  `NEXT_PUBLIC_SITE_URL`) e imagem 1200×630 gerada por lugar (`opengraph-image.tsx`), para o card
  aparecer bonito no Instagram e no WhatsApp.
- **404 de verdade** para id inválido ou inexistente: o `loading.tsx` fica só na lista
  (`lugares/(lista)/`), porque um skeleton acima do detalhe faria a resposta começar com 200.
- **Sem prefetch** nos cards: o detalhe é dinâmico, e o prefetch padrão renderizaria cada card visível
  no servidor (10–20 consultas só por abrir a lista). O detalhe abre em ~340ms após o toque.
- **Ponto de extensão:** `PlaceDetailCard` recebe `extras` (ex.: selo e player da Live, eventos do lugar). O slot `directions` substitui o botão "Como chegar" (usado pelo "Quero ir" de favorites).

## Mapa

- **`MapView`** (`src/shared/ui/map`) é genérico e **não conhece módulos**: recebe **camadas plugáveis**
  (`MapLayer`, com `id` e `add(map)`). Cada módulo fornece a sua (lugares agora; eventos, missões e Live
  depois), e o "mapa como jogo" será a soma delas, sem alterar o componente (OCP).
- **Camada de lugares:** GeoJSON de `GET /api/places/geo` (cache de 5 min), com **clusters** (tocar
  aproxima) e marcadores (tocar abre o resumo com "Ver detalhes" e "Como chegar").
- **`/mapa?lugar=<id>`** abre centralizado no lugar com o resumo aberto ("Ver no mapa" do detalhe e
  links compartilhados).
- **Mapa base:** sem `NEXT_PUBLIC_MAP_STYLE_URL`, usa os tiles raster públicos do OpenStreetMap. Bons
  para a POC, mas a [política de uso](https://operations.osmfoundation.org/policies/tiles/) deles não
  comporta tráfego de produção. **Em produção**, defina `NEXT_PUBLIC_MAP_STYLE_URL` com um estilo
  vetorial de um provedor (MapTiler, Stadia, Protomaps…). Os textos do mapa (ex.: contagem dos clusters)
  usam as fontes públicas da MapLibre (`demotiles.maplibre.org`).
- **Worker do MapLibre:** a v6 usa um Web Worker em módulo ES que o bundler do Next não resolve.
  `scripts/copy-maplibre-worker.mjs` copia o worker para `public/vendor/maplibre/<versão>/` antes de
  `dev` e `build` (fora do Git), e o `MapView` aponta para ele com `setWorkerUrl`.
- **Acessibilidade:** o mapa é visual. Sempre há "Ver em lista" como alternativa, e o resumo é anunciado
  (`aria-live`). Sem WebGL, aparece uma mensagem no lugar do mapa.

## Perto de mim

- `/lugares/perto?lat=&lon=&radius=` e `GET /api/places/nearby` listam do mais perto para o mais longe,
  com a distância em português ("150 m", "1,8 km"). Raios: 1, 2 (padrão), 5 e 10 km.
- PostGIS: `ST_DWithin` filtra pelo raio usando o índice GiST e `ST_Distance` ordena (geografia, em metros).
- **De onde vem o ponto:**
  1. botão **"Perto de mim"** em `/lugares` (GPS do navegador, pedido só no toque);
  2. **tocar num ponto vazio do mapa** → "Lugares perto daqui". Funciona sem GPS ou com permissão negada;
  3. o próprio link, que pode ser compartilhado.
- **Privacidade (LGPD):** a coordenada é arredondada para 4 casas (~10 m) antes de ir para a URL e para a
  consulta. Ela **não é gravada** e **não aparece nos logs** (o log de acesso registra só o caminho, sem a query).
- Ponto fora de Joinville e arredores → mensagem "Fora da área atendida", em vez de uma lista vazia.
- **Para outros módulos:** `servicePointShape` (validação de lat/lon na área atendida), `placeDistances(origem, ids)`
  (distância em lote) e `formatDistance`. O `NearMeButton` aceita `target` para levar a localização a outra tela
  (ex.: `/eventos/agora`).
- **Recomendação:** `placeCandidates({ origin, radiusMeters, categories, limit })` traz lugares no raio (do mais perto)
  ou, sem origem, os mais recentes, com horário, distância e `newSince` (só lugares de parceiro contam como novidade).
  Veja [recomendação](recommendation.md).

## Licença e atribuição (obrigatória)

Os dados do OpenStreetMap são © OpenStreetMap contributors, sob a licença
[ODbL](https://opendatacommons.org/licenses/odbl/). Toda tela que exibir esses lugares (lista,
detalhe, mapa) deve mostrar a atribuição **"© OpenStreetMap contributors"** com link para
https://www.openstreetmap.org/copyright.
