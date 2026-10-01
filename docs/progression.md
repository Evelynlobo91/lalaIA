# Progressão (XP, níveis, conquistas e perfil de explorador)

Módulo `progression` (epic #10). Reage a eventos de outros módulos e nunca é chamado por eles.

```
missions.StepCompleted / MissionCompleted ──► GrantXp ──► xp_transactions (livro-razão)
                                                  └──► progression.XpGranted ──► TrackLevelUp ──► level_ups
                                                                                       └──► progression.LevelReached
missions.* / favorites.FavoriteAdded / progression.LevelReached ──► UnlockAchievements ──► achievements
                                                                        └──► progression.AchievementUnlocked ──► GrantXp (bônus)
```

## Livro-razão de XP (#65, RF31)

Descrito em [missões](missions.md#livro-razão-de-xp-65-rf31--módulo-progression): `progression.xp_transactions`
é append-only, idempotente por `event_id` e por `(user_id, reason, source_id)`, e o saldo é a soma do livro
(view `progression.xp_balances`). Cada crédito **novo** publica `progression.XpGranted { userId, amount, reason }`
depois de gravar.

## Níveis de exploração (#66, RF33)

- **O nível é derivado do saldo de XP**, nunca guardado como número: `levelFor(xp)` (`domain/levels.ts`) é
  uma função pura e testada que devolve o nível, o nome, o próximo nível, quanto falta e o percentual dentro
  do nível atual.
- **A tabela de níveis mora num lugar só** (`LEVELS` em `domain/levels.ts`), com nomes temáticos de Joinville:

  | Nível | Nome | A partir de |
  |------:|------|------------:|
  | 1 | Recém-chegado na Rua das Palmeiras | 0 XP |
  | 2 | Ciclista da Cidade das Bicicletas | 100 XP |
  | 3 | Florista da Festa das Flores | 250 XP |
  | 4 | Bailarino do Festival de Dança | 500 XP |
  | 5 | Navegador da Baía da Babitonga | 900 XP |
  | 6 | Desbravador da Serra Dona Francisca | 1.400 XP |
  | 7 | Lenda da Cidade dos Príncipes | 2.000 XP |

  Mudar a curva ou os nomes é editar essa lista (um teste garante que ela começa em 0 e é crescente).
- **Subir de nível:** `TrackLevelUp` assina `progression.XpGranted`, recalcula o nível pelo saldo e grava o
  nível em `progression.level_ups` (`primary key (user_id, level)`, `on conflict do nothing`). Só quando a
  linha é nova publica **`progression.LevelReached { userId, level }`**: créditos simultâneos ou
  reprocessados publicam o evento uma vez só. O nível 1 é o ponto de partida e não é registrado.
- **Perfil:** a seção **"Seu nível"** (`LevelCard`) mostra o número e o nome do nível, uma barra de progresso
  (`role="progressbar"`) e "Faltam N XP para o nível X". Por 24 h depois de subir, o card ganha o destaque
  "Você subiu para o nível X!" (`role="status"`).
- `level_ups` é append-only (trigger `progression.forbid_history_changes`, com a mesma exceção da exclusão em
  cascata da conta), com RLS: cada pessoa só lê os próprios níveis e ninguém grava como usuário.
- Sem rota HTTP: o perfil é renderizado no servidor (`levelOverviewOf(userId)`, id sempre da sessão).

## Conquistas (#67, RF32)

- **Cada conquista é uma regra** (`AchievementRule`, estratégia) com id estável, título, descrição, dica e
  XP bônus. O catálogo fica em `features/achievements/achievement-catalog.ts`; **nova conquista = nova regra
  na lista** (OCP), sem mexer nos casos de uso. Os ids são gravados no banco: não renomeie um já publicado.

  | Id | Conquista | Regra | Bônus |
  |----|-----------|-------|------:|
  | `primeiro-check-in` | Primeiro check-in | 1 etapa validada no balcão | 10 XP |
  | `primeira-missao` | Primeira missão | 1 missão concluída | 25 XP |
  | `favoritou-5-lugares` | Colecionador de lugares | 5 lugares favoritados | 15 XP |
  | `explorou-3-categorias` | Curiosidade sem fim | 3 categorias diferentes (lugares favoritados ou visitados e eventos favoritados) | 20 XP |
  | `nivel-3` | Florista da Festa das Flores | chegar ao nível 3 | — |

- **Desbloqueio automático:** `UnlockAchievements` assina `missions.StepCompleted`, `missions.MissionCompleted`,
  `favorites.FavoriteAdded` e `progression.LevelReached`. A cada fato, valida o `userId` com zod, monta os
  fatos da pessoa (`ExplorerAchievementFacts`: atividade pelas APIs públicas + nível pelo saldo) e grava as
  regras atendidas que ainda faltam. Avaliar o estado (e não o evento) torna as conquistas retroativas e
  tolerantes à ordem dos eventos.
- **Idempotente:** `progression.achievements` é append-only com `unique (user_id, achievement_id)` e
  `on conflict do nothing`. Só um desbloqueio **novo** publica `progression.AchievementUnlocked
  { userId, achievementId, unlockId, title, bonusXp }`.
- **Bônus pelo livro-razão:** `GrantXp` assina `AchievementUnlocked` e credita com `reason = 'achievement'`
  (migration ajusta o `check`) e `source_id = unlockId`: o bônus entra uma vez só, com a descrição
  "Conquista · <título>", e pode subir o nível (que pode desbloquear a conquista de nível: a cadeia termina
  porque cada desbloqueio é único).
- **Perfil:** a seção **"Conquistas"** (`AchievementsCard`) mostra "N de M desbloqueadas", as desbloqueadas
  (mais recentes primeiro, com a data) e as bloqueadas com a dica de como conseguir. Cada item tem rótulo
  acessível "<título>: desbloqueada|bloqueada".
- **RLS:** cada pessoa só lê as próprias conquistas; ninguém grava como usuário (só o backend, pelos eventos).

### Atividade do explorador (APIs públicas, sem join entre schemas)

`PublicApiExplorerActivity` (`infra/`) monta a atividade com uma chamada por módulo, injetadas na composição:

| Módulo | API pública | O que devolve |
|--------|-------------|---------------|
| missions | `missionExplorationOf(userId)` (**nova**, slice `features/exploration`) | missões concluídas, check-ins e ids dos lugares das etapas concluídas (uma consulta, `asUser`) |
| favorites | `favoriteKeysOf(user)` | chaves dos lugares e eventos favoritados |
| places | `placeFacets(ids)` (**nova**, slice `features/place-facets`) | categoria e bairro de cada lugar (uma consulta, até 500 ids) |
| events | `eventSummaries(ids)` | categoria e bairro dos eventos favoritados |

## Perfil de explorador (#68)

- **Seção "Seu perfil de explorador"** no `/perfil` (`ExplorerProfileCard`): lugares descobertos (favoritados
  ou visitados, sem repetição), lugares visitados (etapas de missão concluídas), eventos favoritados, missões
  concluídas, check-ins e bairros explorados; abaixo, as **descobertas por categoria** (da mais explorada
  para a menos, com o rótulo do catálogo `shared/catalog/categories.ts`) e a lista de bairros. Nível e XP
  aparecem nas seções vizinhas ("Seu nível" e "Seu XP").
- **Tudo derivado, nada guardado:** `explorerProfileFrom(activity)` é uma função pura e testada sobre a
  atividade lida pelas APIs públicas (tabela acima). Não há tabela nem contador próprio.
- **Só a própria pessoa vê:** `explorerProfileOf(userId)` recebe o id da sessão (`requireUser`), validado com
  zod; missions e favorites leem com `asUser`, então a RLS garante que ninguém vê a atividade de outra pessoa
  (coberto em `public-api-explorer-activity.int.test.ts`).
- **Custo:** uma consulta por módulo (missions, favorites, places e, se houver eventos favoritados, events),
  em paralelo quando possível; places e events consultam em lote (`id = any(...)`).
- Sem rota HTTP: o perfil é renderizado no servidor.
