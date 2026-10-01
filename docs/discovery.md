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
