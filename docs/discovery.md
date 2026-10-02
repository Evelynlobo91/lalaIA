# Busca e filtros (módulo `discovery`)

Busca unificada de lugares e eventos de Joinville (RF04). O módulo `discovery` não tem tabelas:
pergunta a `places` e `events` **pelas APIs públicas deles** (`searchPlaces` e `searchEvents` no
`index.ts`) e junta as respostas. Nunca há join entre schemas de módulos diferentes.

```
discovery/
├─ domain/search.ts                 # SearchHit, grupos, portas (SearchablePlaces/SearchableEvents) e SearchFilter
├─ infra/module-search-sources.ts   # adaptadores: APIs públicas de places/events → portas + SearchHit
├─ features/search/                 # caso de uso Search, schema, rota e UI (campo, abas, resultados)
└─ composition.ts / index.ts
places/features/search-places/      # SearchPlaces + infra/postgres-place-search.ts
events/features/search-events/      # SearchEvents + infra/postgres-event-search.ts
```

## Busca (#42)

- **`/buscar?q=`** e **`GET /api/discovery/search?q=&tipo=&cursor=&limit=`**. A resposta vem
  **agrupada por tipo** (`groups: [{ kind: "lugares" | "eventos", items, nextCursor, excluded }]`).
- **Abas** Todos / Lugares / Eventos (`tipo=lugares|eventos`): links com `aria-current` que mantêm a busca.
  Com os dois tipos, cada grupo traz 6 itens; com um tipo só, 20.
- **"Mais lugares" / "Mais eventos"**: cada grupo pagina sozinho pela API, com `tipo` + `cursor`. O cursor é
  opaco e pertence ao módulo de origem (lugares: nome + id, em ordem alfabética `places.pt_br`; eventos: keyset
  em `starts_at, id`). Cursor sem `tipo` ou adulterado → 400.
- **Debounce no campo:** em `/buscar`, a URL é atualizada 300 ms depois da última tecla (`useDebouncedValue`,
  em `shared/ui/debounce.ts`), com `router.replace` dentro de uma transição. A página não tem `loading.tsx` de
  propósito: os resultados antigos ficam na tela e o foco continua no campo. Sem JavaScript, o campo é um
  formulário GET (`next/form`). Abaixo de 2 letras, nada é buscado.
- **Na home**, o mesmo campo (sem debounce) leva para `/buscar`.

### Como o texto casa (Postgres)

- Duas configurações de busca (migration `platform__busca_textual`), usadas juntas:
  - **`platform.busca`**: `unaccent` → `portuguese_stem`. "acai" acha "Açaí", "restaurantes" acha
    "Restaurante" e "museu" acha "Museus".
  - **`platform.busca_simples`**: `unaccent` → `simple` (palavra inteira). Garante o prefixo enquanto a pessoa
    digita: "pizzari" acha "Pizzaria", o que o radical sozinho não acha (`pizzar` ≠ `pizz`).
- O documento é `to_tsvector('platform.busca', x) || to_tsvector('platform.busca_simples', x)`, e cada termo
  vira prefixo nas duas (`termo:*` numa OU na outra). Todos os termos precisam casar. Quem monta isso é
  `textMatch` (`shared/db/text-search.ts`). Os termos passam antes por `searchTerms`
  (`shared/text/search-terms.ts`): só letras e números, no máximo 8. Nada do texto vira sintaxe de `to_tsquery`.
- **Lugares:** pelo nome (índice GIN `places_name_search_idx`). **Eventos:** pelo título + descrição
  (índice GIN `events_text_search_idx`); só agendados que ainda não terminaram.
- **Nome da categoria** também conta (`categoriesMatching`, `shared/catalog/category-search.ts`): "bares",
  "museu" ou "feiras" trazem a categoria inteira. Para isso, **todos** os termos precisam casar com o nome da
  categoria, e por isso "bar do zé" não vira "todos os bares".
- A expressão do documento nas consultas é idêntica à dos índices; os testes de integração conferem pelo
  `explain` que o índice é usado.

## Filtros (#43)

Cinco filtros que se combinam entre si, com a busca (`q`) e com o tipo (`tipo`). Ficam **na URL**
(compartilhável) com os mesmos nomes de `/eventos`:

| Parâmetro | Valores | Lugares | Eventos |
|-----------|---------|---------|---------|
| `categoria` | id do catálogo (`shared/catalog/categories.ts`) | categoria do lugar | categoria do evento |
| `bairro` | nome do bairro (sem diferenciar acento, maiúsculas e espaços) | bairro do lugar | eventos em lugares do bairro (ids vindos de `placeIdsInNeighborhood`) |
| `quando` | `hoje`, `amanha`, `fim-de-semana`, `AAAA-MM-DD` (mesmo `dateFilterParam` de events) | abertos em algum momento do período | que se sobrepõem ao período |
| `horario` | `agora`, `manha` (6h–12h), `tarde` (12h–18h), `noite` (18h–6h) | abertos no horário | que se sobrepõem ao horário |
| `preco` | `gratis`, `ate-50`, `ate-100`, `acima-100` | **não aparecem** (lugar não tem preço; o grupo explica o motivo) | valor "a partir de" na faixa |

- **Sem texto, só com filtros** também vale (ex.: `/buscar?quando=hoje&preco=gratis`). Sem texto e sem filtro, a
  página só mostra a dica.
- **Data + horário** viram períodos no calendário de Joinville (`domain/time-of-day.ts`): só horário = hoje (e o
  resto da noite de ontem, se ainda for madrugada); data + horário = o horário em cada dia da data (fim de
  semana à noite = sábado e domingo à noite); "agora" = o instante atual. O que já passou é cortado.
- **Horário de lugares** vem do OpenStreetMap e é interpretado em memória (`isOpenDuring`, de 15 em 15 min).
  A busca lê em lotes de 100, na ordem do cursor, até completar a página. **Lugares sem horário conhecido não
  aparecem** quando há filtro de data ou horário, porque não dá para prometer que estarão abertos.
- **Estratégias (OCP):** cada filtro é uma classe que implementa `SearchFilter`
  (`features/filters/filters.strategies.ts`): restringe os critérios de lugares e de eventos, ou tira um tipo
  da busca com o motivo. Um filtro novo é uma classe nova mais uma linha em `SearchFilterFactory`, sem mexer em
  `Search` nem nos outros filtros.
- **Painel** (`SearchFilters`): `<details>` com selects e um campo de data. Com JavaScript, cada mudança
  já aplica o filtro e a URL fica só com o que foi escolhido. Sem JavaScript, é um formulário GET (campos vazios
  são ignorados e `data` vira `quando`).
- **Chips** dos filtros ativos removem um filtro de cada vez; **"Limpar filtros"** tira todos e mantém a busca e o
  tipo. Valor inválido (ex.: `quando=2026-02-31`) → aviso na página e 400 na API.
- **`GET /api/discovery/filters`**: opções de cada filtro (categorias, bairros com lugares, atalhos de data,
  horários e faixas de preço).
