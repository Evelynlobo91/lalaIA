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

## Licença e atribuição (obrigatória)

Os dados do OpenStreetMap são © OpenStreetMap contributors, sob a licença
[ODbL](https://opendatacommons.org/licenses/odbl/). Toda tela que exibir esses lugares (lista,
detalhe, mapa) deve mostrar a atribuição **"© OpenStreetMap contributors"** com link para
https://www.openstreetmap.org/copyright.
