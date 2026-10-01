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

## Score ponderado e motivos (#72, RF39–RF41)

- Cada sinal é uma estratégia `ScoreSignal` (`domain/signals.ts`) que devolve uma força de 0 a 1 **e o motivo**:

  | Sinal (`id`) | Peso padrão | Quando pontua | Motivo exibido |
  |--------------|:-----------:|---------------|----------------|
  | `preference` | 3 | categoria entre as preferidas do perfil | "Porque você curte Shows e música" |
  | `happeningNow` | 2,5 | evento acontecendo (1), começando no tempo disponível (0,6), lugar aberto (0,3) | "Acontecendo agora", "Começa em 40 min", "Aberto agora" |
  | `live` | 3 | live ativa (porta `LiveStatusReader`; hoje o stub `NoLiveYet` não tem nenhuma) | "Com live agora" |
  | `novelty` | 1,5 | publicado/cadastrado há menos de 14 dias (decai até zero) | "Novidade na agenda", "Novo no LalaIA", "Missão nova" |
  | `favorite` | 2 | está nos favoritos | "Está nos seus favoritos" |
  | `proximity` | 1,5 | com localização: 1 no ponto, 0 na distância máxima | "A 300 m de você" |

- **Score = Σ peso × força.** Os motivos vêm do que mais pesou para o que menos (a tela mostra até 2).
- **Pesos num lugar só:** `DEFAULT_WEIGHTS` em `domain/score-weights.ts`. Para mudar **sem alterar código**, defina
  `RECOMMENDATION_WEIGHTS` com um JSON parcial (ex.: `{"live":5,"novelty":0}`, cada peso de 0 a 10). JSON inválido ou
  sinal desconhecido → loga um aviso e usa os padrões (o app não cai).
- **Determinístico:** empate desempata por distância, início, título e chave.
- **Perfil (`TasteProfileReader`):** preferências de identity (`userPreferences().preferencesOf`) + favoritos
  (`favoriteKeysOf`, nova função de favorites, uma consulta). Visitante recebe um ranking sem gosto pessoal.
  Se os favoritos falharem, segue sem eles; se a Live falhar, segue sem live (ambos logados).
- **`RecommendationEngine.recommend(constraints, profile, limit)`** junta as camadas (candidatos → live → ranking → top N).
  É a **porta do "ME SURPREENDA" (#74)**: o roteiro do LLM parte do top 10–20 dela, e todo item do roteiro precisa
  estar nessa lista. Exportado no `index.ts` como `recommendationEngine()`.
- **API:** `GET /api/recommendations?limite=20` (+ os mesmos parâmetros dos candidatos). Itens com `reasons`,
  `timeLabel`, `distanceLabel`, `priceLabel`, `live` e `score`.
- **UI:** `RecommendationCard`/`RecommendationList` (motivos como selos, preço ou XP, tempo e distância).

| Módulo | Função nova | Para quê |
|--------|-------------|----------|
| `favorites` | `favoriteKeysOf(user)` | só tipo + id dos favoritos (sinal "Está nos seus favoritos") |

## Restrições: tempo, orçamento, localização e tipo (#73, RF43)

- **`/sugestoes`**: "tenho 2 horas, R$70, estou no centro, quero algo diferente" em chips:
  - **tempo:** 1, 2 (padrão), 3, 4 ou 6 h;
  - **orçamento total do grupo:** grátis, R$ 30, 50, 70, 100, 200 ou sem limite (padrão: o do perfil);
  - **pessoas:** 1, 2, 3, 4 ou 6 (padrão pelo "com quem sai" do perfil: casal 2, amigos/família 4);
  - **tipo de experiência:** qualquer, comer e beber, música e festa, cultura, ar livre e esporte, com crianças,
    compras e feiras, ou **algo diferente** (evita as categorias preferidas do perfil);
  - **localização (opcional):** "Usar minha localização" (GPS só no toque, arredondado) e "Remover localização".
    A distância máxima vem do perfil.
- **Até 3 toques:** o formulário já nasce com o perfil; cada chip é um link que muda um valor e mantém os outros.
- **Estado na URL** (`?tempo=120&orcamento=70&pessoas=2&tipo=diferente&lat=&lon=`; `orcamento=sem` = sem limite):
  funciona sem JavaScript e pode ser compartilhado. Validado com zod (`rec-constraints.schema.ts`); valor inválido
  mostra um aviso e a página segue com os padrões do perfil.
- `resolveConstraints` (puro) junta URL + perfil nas restrições do motor; `RecommendWithConstraints` as **envia ao
  motor** e devolve o estado efetivo para marcar os chips.
- **API:** `GET /api/recommendations/for-me` com os mesmos parâmetros (400 se inválidos), usando o perfil da sessão.

## Privacidade (LGPD)

A localização é opcional, pedida **só no toque** (`NearMeButton` de places), arredondada para 4 casas (~10 m)
e validada na área atendida (`servicePointShape`). Ela vive só durante a requisição: **não é gravada** e
**não vai para os logs** (o log de acesso registra só o caminho, e o log de falha de fonte registra só o nome da fonte).
