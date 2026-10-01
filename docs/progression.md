# Progressão (XP, níveis, conquistas e perfil de explorador)

Módulo `progression` (epic #10). Reage a eventos de outros módulos e nunca é chamado por eles.

```
missions.StepCompleted / MissionCompleted ──► GrantXp ──► xp_transactions (livro-razão)
                                                  └──► progression.XpGranted ──► TrackLevelUp ──► level_ups
                                                                                       └──► progression.LevelReached
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
