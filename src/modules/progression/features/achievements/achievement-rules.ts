import type { AchievementFacts, AchievementRule } from "../../domain/achievements";
import { levelDefinition } from "../../domain/levels";

/** Conclua a primeira missão. */
export class FirstMissionRule implements AchievementRule {
  readonly id = "primeira-missao";
  readonly title = "Primeira missão";
  readonly description = "Concluiu a primeira missão urbana.";
  readonly hint = "Aceite uma missão e conclua todas as etapas.";
  readonly bonusXp = 25;
  isMet(f: AchievementFacts) {
    return f.completedMissions >= 1;
  }
}

/** Valide o primeiro QR code no balcão. */
export class FirstCheckInRule implements AchievementRule {
  readonly id = "primeiro-check-in";
  readonly title = "Primeiro check-in";
  readonly description = "Validou a primeira etapa no balcão.";
  readonly hint = "Escaneie o QR code de uma etapa de missão no lugar.";
  readonly bonusXp = 10;
  isMet(f: AchievementFacts) {
    return f.checkIns >= 1;
  }
}

/** Favorite N lugares. */
export class FavoritePlacesRule implements AchievementRule {
  readonly id: string;
  readonly title = "Colecionador de lugares";
  readonly description: string;
  readonly hint: string;
  readonly bonusXp = 15;
  constructor(private readonly count: number) {
    this.id = `favoritou-${count}-lugares`;
    this.description = `Favoritou ${count} lugares de Joinville.`;
    this.hint = `Favorite ${count} lugares que você quer conhecer.`;
  }
  isMet(f: AchievementFacts) {
    return f.favoritePlaces >= this.count;
  }
}

/** Explore N categorias diferentes (lugares descobertos e eventos favoritados). */
export class CategoriesRule implements AchievementRule {
  readonly id: string;
  readonly title = "Curiosidade sem fim";
  readonly description: string;
  readonly hint: string;
  readonly bonusXp = 20;
  constructor(private readonly count: number) {
    this.id = `explorou-${count}-categorias`;
    this.description = `Explorou ${count} categorias diferentes.`;
    this.hint = `Favorite ou visite lugares e eventos de ${count} categorias diferentes (ex.: cafés, parques e cultura).`;
  }
  isMet(f: AchievementFacts) {
    return f.exploredCategories >= this.count;
  }
}

/** Chegue ao nível N. */
export class LevelRule implements AchievementRule {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly hint: string;
  readonly bonusXp = 0;
  constructor(private readonly level: number) {
    const name = levelDefinition(level)?.name ?? `Nível ${level}`;
    this.id = `nivel-${level}`;
    this.title = name;
    this.description = `Chegou ao nível ${level}.`;
    this.hint = `Ganhe XP com missões até chegar ao nível ${level}.`;
  }
  isMet(f: AchievementFacts) {
    return f.level >= this.level;
  }
}
