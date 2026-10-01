# Recomendação

Módulo `recommendation` (epic #11): o cérebro do "O que eu posso fazer **agora**, em Joinville, que combina comigo?".

```
fontes de candidatos ──► filtros duros ──► score ponderado ──► top N (+ motivos)
 (lugares, eventos,       (tempo, orçamento,  (preferências, agora,    │
  missões; Live depois)    distância, tipo)    live, novidade...)      └─► "ME SURPREENDA" (#74, LLM)
```

O módulo não tem tabelas. Ele lê tudo pelas APIs públicas (`index.ts`) de `places`, `events`, `missions`,
`identity` e `favorites`, sem join entre schemas.

## Camada 1: candidatos e filtros duros (#71, RF39, RF43)

- **Fontes (`CandidateSource`, OCP/DIP)** em `infra/`. Cada uma traduz a API pública de um módulo para `Candidate`
  (lugar, evento ou missão, com disponibilidade, preço por pessoa, distância e "novidade"):
  - **lugares** (`placeCandidates` de places): até 200 no raio, do mais perto para o mais longe (PostGIS
    `ST_DWithin`); sem localização, os mais recentes. O "aberto agora" vem de `isOpenAt` (horário do OSM),
    sondado de 10 em 10 min (`openWindow`) para saber até quando o lugar fica aberto;
  - **eventos** (`eventCandidates` de events): agendados que se sobrepõem a `[agora, agora + tempo disponível)`.
    A distância vem de `placeDistances` (uma consulta);
  - **missões** (`availableMissions` de missions): disponíveis agora; a distância é a da etapa mais perto.
  - Uma fonte que falha é **logada e ignorada**; as outras continuam.
- **Filtros duros (`CandidateFilter`, estratégias combináveis)** em `domain/filters.ts`, todos puros e testados:

  | Filtro | Regra |
  |--------|-------|
  | `FitsTimeWindow` | aberto/acontecendo por pelo menos **30 min** dentro do tempo disponível (ou o tempo todo, se for menor). Fechando em 10 min → fora. Horário desconhecido → só ao ar livre |
  | `FitsBudget` | preço por pessoa × pessoas ≤ orçamento total. **Sem preço** (lugares, missões): entra, exceto em "só grátis", em que só o que é ao ar livre entra |
  | `WithinDistance` | com localização, até a distância máxima (distância desconhecida fica de fora); sem localização, não filtra |
  | `MatchesExperience` | só as categorias do tipo de experiência escolhido (missões não têm categoria) |
  | `AvoidsUsual` | "quero algo diferente": fora das categorias de sempre |

  "Ao ar livre" = `ar-livre` e `passeios` (`OPEN_AIR_CATEGORIES`). Um filtro novo é uma nova classe em `defaultFilters`.
- **API:** `GET /api/recommendations/candidates?tempo=120&orcamento=70&pessoas=2&raio=5&categoria=shows,bares&lat=&lon=`
  (tempo em minutos, orçamento total em reais, raio em km). Sem ranking. Parâmetro inválido → 400.

### Funções novas em outros módulos

| Módulo | Função | Para quê |
|--------|--------|----------|
| `places` | `placeCandidates({ origin, radiusMeters, categories, limit })` | lugares no raio (ou os mais recentes), com horário, distância e `newSince` (só lugares de parceiro: os do OSM não são "novidade") |
| `events` | `eventCandidates({ from, to, limit })` | eventos agendados no período, com o lugar e a data de publicação |

## Privacidade (LGPD)

A localização é opcional, pedida **só no toque** (`NearMeButton` de places), arredondada para 4 casas (~10 m)
e validada na área atendida (`servicePointShape`). Ela vive só durante a requisição: **não é gravada** e
**não vai para os logs** (o log de acesso registra só o caminho, e o log de falha de fonte registra só o nome da fonte).
